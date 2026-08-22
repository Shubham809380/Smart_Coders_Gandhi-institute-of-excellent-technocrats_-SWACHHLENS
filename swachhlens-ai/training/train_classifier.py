"""
SwachhLens - Waste Classifier Training (transfer learning, CPU-friendly)

Phase A: compare MobileNetV3-Small / EfficientNet-B0 / ResNet18 by freezing the
         pretrained backbone, caching pooled features once, and training only a
         linear head. Fast and fair: same data, same head protocol.
Phase B: fully fine-tune the winning architecture (last stages unfrozen) with
         realistic augmentation, weighted loss, AdamW + cosine schedule,
         early stopping on validation macro-F1.

Outputs:
  checkpoints/best_classifier.pth   {arch, classes, img_size, state_dict, metrics}

Usage:
  python training/train_classifier.py            # A then B
  python training/train_classifier.py --phase a  # selection only
"""
from __future__ import annotations

import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import f1_score
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.models import (efficientnet_b0, mobilenet_v3_small, resnet18,
                                EfficientNet_B0_Weights, MobileNet_V3_Small_Weights,
                                ResNet18_Weights)

TRAINING_DIR = Path(__file__).resolve().parent
ROOT = TRAINING_DIR.parents[1]
CKPT_DIR = ROOT / "swachhlens-ai" / "checkpoints"
CKPT_DIR.mkdir(parents=True, exist_ok=True)

SEED = 42
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
NUM_WORKERS = 6


def seed_everything(seed: int = SEED) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)


def build_transforms(img_size: int):
    imagenet_mean = [0.485, 0.456, 0.406]
    imagenet_std = [0.229, 0.224, 0.225]
    train_tf = transforms.Compose([
        transforms.RandomResizedCrop(img_size, scale=(0.65, 1.0)),
        transforms.RandomHorizontalFlip(0.5),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.10),
        transforms.ToTensor(),
        transforms.Normalize(imagenet_mean, imagenet_std),
    ])
    eval_tf = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(imagenet_mean, imagenet_std),
    ])
    return train_tf, eval_tf


class ManifestDataset(Dataset):
    def __init__(self, records: list[dict], tf, class_to_idx: dict[str, int]):
        self.records = records
        self.tf = tf
        self.class_to_idx = class_to_idx

    def __len__(self):
        return len(self.records)

    def __getitem__(self, i):
        rec = self.records[i]
        img = Image.open(ROOT / rec["path"]).convert("RGB")
        return self.tf(img), self.class_to_idx[rec["label"]]


def load_manifest():
    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    classes = manifest["classes"]
    class_to_idx = {c: i for i, c in enumerate(classes)}
    by_split: dict[str, list] = {"train": [], "val": [], "test": []}
    for r in manifest["records"]:
        by_split[r["split"]].append(r)
    counts = Counter = None
    from collections import Counter as C
    counts = C(r["label"] for r in by_split["train"])
    n = sum(counts.values())
    # inverse-sqrt frequency -> gentle reweighting, not blind oversampling
    w = torch.tensor([ (n / len(classes)) ** 0.5 / max(1, counts[c]) ** 0.5 for c in classes ],
                     dtype=torch.float32)
    return classes, class_to_idx, by_split, w.to(DEVICE)


def make_model(arch: str, num_classes: int) -> tuple[nn.Module, nn.Module]:
    """Returns (backbone_without_pooling_head, feature_dim)."""
    if arch == "mobilenet_v3_small":
        m = mobilenet_v3_small(weights=MobileNet_V3_Small_Weights.IMAGENET1K_V1)
        feat_dim = m.classifier[0].in_features
        backbone = m.features
        pool = nn.AdaptiveAvgPool2d(1)
        return nn.Sequential(backbone, pool, nn.Flatten()), feat_dim
    if arch == "efficientnet_b0":
        m = efficientnet_b0(weights=EfficientNet_B0_Weights.IMAGENET1K_V1)
        feat_dim = m.classifier[1].in_features
        return nn.Sequential(m.features, nn.AdaptiveAvgPool2d(1), nn.Flatten()), feat_dim
    if arch == "resnet18":
        m = resnet18(weights=ResNet18_Weights.IMAGENET1K_V1)
        feat_dim = m.fc.in_features
        body = nn.Sequential(*list(m.children())[:-2], nn.AdaptiveAvgPool2d(1), nn.Flatten())
        return body, feat_dim
    raise ValueError(arch)


@torch.inference_mode()
def extract_features(backbone: nn.Module, loader: DataLoader) -> tuple[torch.Tensor, torch.Tensor]:
    backbone.eval()
    feats, ys = [], []
    for x, y in loader:
        feats.append(backbone(x.to(DEVICE)))
        ys.append(y)
    return torch.cat(feats), torch.cat(ys).to(DEVICE)


def train_head(feats: torch.Tensor, ys: torch.Tensor, vfeats: torch.Tensor, vys: torch.Tensor,
               feat_dim: int, num_classes: int, class_w: torch.Tensor,
               max_epochs: int = 120, patience: int = 15) -> tuple[nn.Module, float]:
    head = nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, num_classes)).to(DEVICE)
    opt = torch.optim.AdamW(head.parameters(), lr=1e-3, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max_epochs)
    crit = nn.CrossEntropyLoss(weight=class_w)
    X, V = feats.to(DEVICE), vfeats.to(DEVICE)
    best_f1, best_state, wait = -1.0, None, 0
    bs = 512
    for epoch in range(max_epochs):
        head.train()
        perm = torch.randperm(len(X))
        for i in range(0, len(X), bs):
            idx = perm[i:i + bs]
            loss = crit(head(X[idx]), ys[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
        sched.step()
        head.eval()
        with torch.no_grad():
            pred = head(V).argmax(1).cpu()
        f1 = f1_score(vys.cpu(), pred, average="macro")
        if f1 > best_f1:
            best_f1, wait = f1, 0
            best_state = {k: v.detach().clone() for k, v in head.state_dict().items()}
        else:
            wait += 1
            if wait >= patience:
                break
    head.load_state_dict(best_state)
    return head, best_f1


def benchmark_latency(model: nn.Module, img_size: int, runs: int = 40) -> float:
    model.eval().to(DEVICE)
    x = torch.randn(1, 3, img_size, img_size).to(DEVICE)
    with torch.inference_mode():
        for _ in range(5):
            model(x)
        t0 = time.time()
        for _ in range(runs):
            model(x)
    return (time.time() - t0) / runs * 1000  # ms/image


# ---------------------------------------------------------------------------
# Phase B helpers
# ---------------------------------------------------------------------------
def unfreeze_tail(model_backbone_seq: nn.Module, arch: str, n_blocks: int) -> None:
    """Unfreeze last `n_blocks` children of the features module."""
    features = model_backbone_seq[0]
    for p in features.parameters():
        p.requires_grad = False
    for block in list(features.children())[-n_blocks:]:
        for p in block.parameters():
            p.requires_grad = True


def fine_tune(arch: str, classes: list[str], class_to_idx: dict, by_split: dict,
              class_w: torch.Tensor, img_size: int, epochs: int = 10,
              tail_blocks: int = 3, lr_head: float = 3e-4, lr_tail: float = 5e-5) -> dict:
    train_tf, eval_tf = build_transforms(img_size)
    tr_ds = ManifestDataset(by_split["train"], train_tf, class_to_idx)
    va_ds = ManifestDataset(by_split["val"], eval_tf, class_to_idx)
    tr = DataLoader(tr_ds, batch_size=64, shuffle=True, num_workers=NUM_WORKERS,
                    persistent_workers=True, drop_last=True)
    va = DataLoader(va_ds, batch_size=128, shuffle=False, num_workers=2, persistent_workers=True)

    seq, feat_dim = make_model(arch, len(classes))
    unfreeze_tail(seq, arch, tail_blocks)
    head = nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, len(classes)))
    model = nn.Sequential(seq, head).to(DEVICE)

    tail_params = [p for p in seq.parameters() if p.requires_grad]
    opt = torch.optim.AdamW([
        {"params": head.parameters(), "lr": lr_head},
        {"params": tail_params, "lr": lr_tail},
    ], weight_decay=1e-4)
    steps_per_epoch = len(tr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=epochs * steps_per_epoch)
    crit = nn.CrossEntropyLoss(weight=class_w)

    best = {"f1": -1.0}
    history = []
    total_batches = len(tr)
    for epoch in range(epochs):
        model.train()
        t0 = time.time()
        running = 0.0
        for bi, (x, y) in enumerate(tr):
            x, y = x.to(DEVICE), y.to(DEVICE)
            logits = model(x)
            loss = crit(logits, y)
            opt.zero_grad()
            loss.backward()
            opt.step()
            sched.step()
            running += loss.item() * len(x)
            if bi % 20 == 0:
                el = time.time() - t0
                print(f"  e{epoch} batch {bi}/{total_batches} loss={loss.item():.3f} "
                      f"({el:.0f}s)", flush=True)
        train_loss = running / len(tr_ds)

        model.eval()
        preds, gts = [], []
        with torch.no_grad():
            for x, y in va:
                p = model(x.to(DEVICE)).argmax(1).cpu()
                preds.append(p)
                gts.append(y)
        import torch as _t
        f1 = f1_score(_t.cat(gts), _t.cat(preds), average="macro")
        acc = (_t.cat(gts) == _t.cat(preds)).float().mean().item()
        dt = time.time() - t0
        history.append({"epoch": epoch, "train_loss": round(train_loss, 4),
                        "val_macro_f1": round(f1, 4), "val_acc": round(acc, 4), "sec": round(dt)})
        print(json.dumps(history[-1]))
        if f1 > best["f1"]:
            best = {"f1": f1, "acc": acc, "epoch": epoch,
                    "state": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}}
            print(f"  new best macro-F1={f1:.4f}, saved")
        # crude early stop: no improvement in 3 epochs
        if epoch - best["epoch"] >= 3:
            print("  early stop")
            break
    return {"best": best, "history": history, "model": model}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=["a", "b", "full"], default="full")
    ap.add_argument("--img-size", type=int, default=192)
    ap.add_argument("--epochs-b", type=int, default=10)
    ap.add_argument("--tail-blocks", type=int, default=3)
    ap.add_argument("--arch", default=None,
                    help="override winner architecture for phase b")
    args = ap.parse_args()

    seed_everything()
    classes, class_to_idx, by_split, class_w = load_manifest()
    print(f"Device: {DEVICE} | classes: {classes}", flush=True)

    _, eval_tf = build_transforms(args.img_size)
    results = {}

    if args.phase in ("a", "full"):
        print("\n=== PHASE A: architecture selection (frozen-backbone linear probes) ===")
        tr_probe = DataLoader(ManifestDataset(by_split["train"], eval_tf, class_to_idx),
                              batch_size=128, shuffle=False, num_workers=NUM_WORKERS)
        va_probe = DataLoader(ManifestDataset(by_split["val"], eval_tf, class_to_idx),
                              batch_size=256, shuffle=False, num_workers=2)
        for arch in ["mobilenet_v3_small", "efficientnet_b0", "resnet18"]:
            t0 = time.time()
            backbone, feat_dim = make_model(arch, len(classes))
            backbone.load_state_dict(backbone.state_dict())  # noop, keeps type checkers happy
            backbone = backbone.to(DEVICE).eval()
            for p in backbone.parameters():
                p.requires_grad = False
            print(f"[{arch}] extracting features...", flush=True)
            Xtr, ytr = extract_features(backbone, tr_probe)
            Xva, yva = extract_features(backbone, va_probe)
            head, vf1 = train_head(Xtr, ytr, Xva, yva, feat_dim, len(classes), class_w)
            lat = benchmark_latency(nn.Sequential(backbone, head), args.img_size)
            params = sum(p.numel() for p in nn.Sequential(backbone, head).parameters()) / 1e6
            results[arch] = {"val_macro_f1": round(vf1, 4), "latency_ms": round(lat, 1),
                             "params_m": round(params, 2), "feature_extraction_sec": round(time.time() - t0)}
            print(json.dumps({arch: results[arch]}))

        winner = max(results, key=lambda k: (results[k]["val_macro_f1"], -results[k]["latency_ms"]))
        print(f"\nWINNER: {winner} -> {results[winner]}")

    if args.phase in ("b", "full"):
        arch = args.arch or (winner if args.phase == "full" else "efficientnet_b0")
        print(f"\n=== PHASE B: fine-tuning {arch} ===")
        ft = fine_tune(arch, classes, class_to_idx, by_split, class_w,
                       img_size=args.img_size, epochs=args.epochs_b,
                       tail_blocks=args.tail_blocks)
        ckpt = {
            "arch": arch,
            "classes": classes,
            "img_size": args.img_size,
            "state_dict": ft["best"]["state"],
            "metrics": {
                "val_macro_f1": round(ft["best"]["f1"], 4),
                "val_acc": round(ft["best"].get("acc", 0.0), 4),
                "phase_a_selection": results,
                "history": ft["history"],
            },
        }
        out = CKPT_DIR / "best_classifier.pth"
        torch.save(ckpt, out)
        (CKPT_DIR / "training_summary.json").write_text(json.dumps(
            {"phase_a": results, "phase_b_history": ft["history"]}, indent=2))
        print(f"\nSaved checkpoint -> {out}")


if __name__ == "__main__":
    main()
