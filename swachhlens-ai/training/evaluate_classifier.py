"""
SwachhLens - Final Evaluation on the untouched TEST split.

Reports accuracy, macro precision/recall/F1, per-class metrics and the full
confusion matrix. Additionally simulates the production rejection rule
(thresholds.json) to show how many known-waste images would be flagged UNKNOWN,
and - if CIFAR-10 proxy negatives are cached locally - the unknown rejection rate.

Usage:  python training/evaluate_classifier.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from sklearn.metrics import (accuracy_score, classification_report, confusion_matrix,
                             f1_score, precision_recall_fscore_support)
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

TRAINING_DIR = Path(__file__).resolve().parent
ROOT = TRAINING_DIR.parents[1]
CKPT_DIR = ROOT / "swachhlens-ai" / "checkpoints"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


class ListDataset(Dataset):
    def __init__(self, items, tf):
        self.items, self.tf = items, tf

    def __len__(self):
        return len(self.items)

    def __getitem__(self, i):
        item = self.items[i]
        img = item.convert("RGB") if isinstance(item, Image.Image) else Image.open(item).convert("RGB")
        return self.tf(img), i


def load_model():
    ckpt = torch.load(CKPT_DIR / "best_classifier.pth", map_location=DEVICE, weights_only=False)
    from train_classifier import make_model
    seq, feat_dim = make_model(ckpt["arch"], len(ckpt["classes"]))
    model = nn.Sequential(seq, nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, len(ckpt["classes"]))))
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(DEVICE)
    tf = transforms.Compose([
        transforms.Resize((ckpt.get("img_size", 192),) * 2),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])
    return ckpt, model, tf


@torch.inference_mode()
def predict(model, loader):
    probs = []
    for x, _ in loader:
        probs.append(torch.softmax(model(x.to(DEVICE)), dim=1).cpu())
    return torch.cat(probs).numpy()


def main() -> None:
    ckpt, model, tf = load_model()
    classes = ckpt["classes"]

    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    test_recs = [r for r in manifest["records"] if r["split"] == "test"]
    paths = [ROOT / r["path"] for r in test_recs]
    y_true = np.array([classes.index(r["label"]) for r in test_recs])

    loader = DataLoader(ListDataset(paths, tf), batch_size=128, num_workers=6)
    probs = predict(model, loader)
    y_pred = probs.argmax(1)
    conf = probs.max(1)
    top2 = np.sort(probs, axis=1)
    margin = top2[:, -1] - top2[:, -2]

    print("=" * 62)
    print(f"TEST SET EVALUATION  ({len(paths)} images, {len(classes)} classes)")
    print(f"arch={ckpt['arch']}  val_macro_f1={ckpt['metrics']['val_macro_f1']}")
    print("=" * 62)

    acc = accuracy_score(y_true, y_pred)
    p, r, f1, sup = precision_recall_fscore_support(y_true, y_pred, labels=range(len(classes)), zero_division=0)
    print(f"\nAccuracy:        {acc:.4f}")
    print(f"Macro Precision: {p.mean():.4f}")
    print(f"Macro Recall:    {r.mean():.4f}")
    print(f"Macro F1:        {f1.mean():.4f}")

    print(f"\n{'class':<14}{'prec':>7}{'rec':>7}{'f1':>7}{'support':>9}")
    for i, c in enumerate(classes):
        print(f"{c:<14}{p[i]:>7.3f}{r[i]:>7.3f}{f1[i]:>7.3f}{sup[i]:>9}")

    print("\nConfusion matrix (rows=true, cols=pred):")
    cm = confusion_matrix(y_true, y_pred)
    short = [c[:8] for c in classes]
    hdr = "        " + "".join(f"{s:>9}" for s in short)
    print(hdr)
    for i, row in enumerate(cm):
        print(f"{short[i]:>8}" + "".join(f"{v:>9}" for v in row))

    # ---- production rejection simulation ---------------------------------
    th_path = CKPT_DIR / "thresholds.json"
    if th_path.exists():
        th = json.loads(th_path.read_text())
        ct, mt = th["conf_threshold"], th["margin_threshold"]
        accepted = (conf >= ct) & (margin >= mt)
        n = len(conf)
        print("\n" + "=" * 62)
        print(f"REJECTION RULE  conf>={ct} & margin>={mt}   ({th['selection_basis']})")
        print("=" * 62)
        print(f"Known waste accepted:            {100 * accepted.mean():.2f}%")
        print(f"Known waste flagged UNKNOWN:     {100 * (~accepted).mean():.2f}%")
        per_cls_acc = {}
        for i, c in enumerate(classes):
            m = y_true == i
            per_cls_acc[c] = round(float(accepted[m].mean()) * 100, 1)
        worst = sorted(per_cls_acc.items(), key=lambda kv: kv[1])[:3]
        print(f"Lowest-acceptance classes: {worst}")

        cifar_cache = TRAINING_DIR / "cifar10"
        if cifar_cache.exists():
            try:
                from torchvision.datasets import CIFAR10
                raw = CIFAR10(root=str(cifar_cache), train=False, download=True)
                idx = list(range(0, len(raw), 3))
                imgs = [raw[i][0] for i in idx]
                ld = DataLoader(ListDataset(imgs, tf), batch_size=128, num_workers=4)
                pp = predict(model, ld)
                c2 = pp.max(axis=1)
                t2 = np.sort(pp, axis=1)
                mm = t2[:, -1] - t2[:, -2]
                rej = ~((c2 >= ct) & (mm >= mt))
                print(f"\nCIFAR-10 proxy negatives ({len(idx)}):")
                print(f"Unknown correctly rejected:      {100 * rej.mean():.2f}%")
                print(f"Unknown incorrectly ACCEPTED:    {100 * (~rej).mean():.2f}%")
            except Exception as e:  # noqa: BLE001
                print(f"CIFAR eval skipped: {e}")
        else:
            print("\n(CIFAR-10 not downloaded; run calibrate_threshold.py first)")
    else:
        print("\nNo thresholds.json yet - run calibrate_threshold.py")

    out = {
        "test_accuracy": round(acc, 4),
        "macro": {"precision": round(p.mean(), 4), "recall": round(r.mean(), 4), "f1": round(f1.mean(), 4)},
        "per_class": {c: {"precision": round(p[i], 3), "recall": round(r[i], 3),
                          "f1": round(f1[i], 3), "support": int(sup[i])}
                      for i, c in enumerate(classes)},
        "confusion_matrix": cm.tolist(),
        "confidence_stats": {"mean": float(conf.mean()), "median": float(np.median(conf)),
                             "p10": float(np.percentile(conf, 10)), "p90": float(np.percentile(conf, 90))},
    }
    (CKPT_DIR / "eval_report.json").write_text(json.dumps(out, indent=2))
    print(f"\nSaved -> {CKPT_DIR / 'eval_report.json'}")


if __name__ == "__main__":
    main()
