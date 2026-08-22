"""
SwachhLens - Threshold Calibration & Unknown Rejection

Sweeps confidence thresholds (and top1-top2 margin rules) on the VALIDATION set,
and - if available - against a real NEGATIVE (non-waste) image set to measure
unknown rejection. Two negative sources are supported:

  1. dataset/negative/<any images>          (user-provided photos)
  2. CIFAR-10 test split as proxy negatives (auto-download, ~170MB)

The selected operating point balances waste coverage vs unknown rejection and is
saved to checkpoints/thresholds.json for the inference service.

Usage:  python training/calibrate_threshold.py [--skip-cifar]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms

TRAINING_DIR = Path(__file__).resolve().parent
ROOT = TRAINING_DIR.parents[1]
CKPT_DIR = ROOT / "swachhlens-ai" / "checkpoints"
NEGATIVE_DIR = TRAINING_DIR.parent.parent / "dataset" / "negative"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
CONF_GRID = [round(x, 2) for x in np.arange(0.50, 0.96, 0.05)]
MARGIN_GRID = [0.00, 0.05, 0.10]


class FolderImageDataset(Dataset):
    def __init__(self, paths, tf):
        self.paths, self.tf = paths, tf

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        try:
            item = self.paths[i]
            img = item.convert("RGB") if isinstance(item, Image.Image) else Image.open(item).convert("RGB")
        except Exception:
            img = Image.new("RGB", (64, 64))
        return self.tf(img), i


def cifar_transform(img_size: int):
    # CIFAR images are 32x32; upscale then apply the standard eval pipeline.
    return transforms.Compose([
        transforms.Resize((img_size, img_size), interpolation=transforms.InterpolationMode.BILINEAR),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])


@torch.inference_mode()
def predict_probs(model, loader) -> tuple[np.ndarray, np.ndarray]:
    """Returns (max_prob[], margin[]) arrays."""
    probs_all, margins_all = [], []
    for x, _ in loader:
        p = torch.softmax(model(x.to(DEVICE)), dim=1).cpu()
        top2 = p.topk(min(2, p.shape[1]), dim=1).values
        probs_all.append(top2[:, 0])
        margins_all.append(top2[:, 0] - top2[:, 1] if top2.shape[1] > 1 else torch.ones_like(top2[:, 0]))
    return torch.cat(probs_all).numpy(), torch.cat(margins_all).numpy()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-cifar", action="store_true")
    args = ap.parse_args()

    ckpt = torch.load(CKPT_DIR / "best_classifier.pth", map_location=DEVICE, weights_only=False)
    classes = ckpt["classes"]
    img_size = ckpt.get("img_size", 192)

    from train_classifier import make_model  # reuse architecture factory
    seq, feat_dim = make_model(ckpt["arch"], len(classes))
    import torch.nn as nn
    model = nn.Sequential(seq, nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, len(classes))))
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(DEVICE)

    eval_tf = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
    ])

    # ---- known-waste validation distribution -----------------------------
    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    val_paths = [(ROOT / r["path"]) for r in manifest["records"] if r["split"] == "val"]
    va_loader = DataLoader(FolderImageDataset(val_paths, eval_tf), batch_size=128, num_workers=6)
    val_p, val_m = predict_probs(model, va_loader)
    print(f"Val: n={len(val_p)} mean_conf={val_p.mean():.3f}")

    # ---- optional real negatives ----------------------------------------
    neg_sources: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    if NEGATIVE_DIR.exists():
        neg_paths = sorted([p for p in NEGATIVE_DIR.rglob("*") if p.suffix.lower()
                            in {".jpg", ".jpeg", ".png", ".webp"}])
        if neg_paths:
            ld = DataLoader(FolderImageDataset(neg_paths, eval_tf), batch_size=64, num_workers=4)
            neg_sources["user_negative"] = predict_probs(model, ld)
            print(f"user_negative set: {len(neg_paths)} images")

    if not args.skip_cifar:
        try:
            from torchvision.datasets import CIFAR10
            raw = CIFAR10(root=str(TRAINING_DIR / "cifar10"), train=False, download=True)
            subset_idx = list(range(0, len(raw), 3))  # ~3333 images, enough signal
            imgs = [raw[i][0] for i in subset_idx]
            ld = DataLoader(FolderImageDataset(imgs, cifar_transform(img_size)),
                            batch_size=128, num_workers=4)
            neg_sources["cifar10_proxy"] = predict_probs(model, ld)
            print(f"cifar10_proxy negatives: {len(subset_idx)} images")
        except Exception as e:  # noqa: BLE001
            print(f"CIFAR-10 unavailable ({e}); calibrating without proxy negatives")

    # ---- sweep ------------------------------------------------------------
    rows = []
    for ct in CONF_GRID:
        for mt in MARGIN_GRID:
            accept_val = float(((val_p >= ct) & (val_m >= mt)).mean())
            row = {"conf": ct, "margin": mt,
                   "val_coverage": round(accept_val, 4),
                   "known_rejected_pct": round(100 * (1 - accept_val), 2)}
            scores = []
            for name, (np_, nm_) in neg_sources.items():
                rej = float(((np_ < ct) | (nm_ < mt)).mean())
                row[f"{name}_rejected_pct"] = round(rej * 100, 2)
                # balanced objective: harmonic mean of coverage & rejection
                cov = max(accept_val, 1e-6)
                scores.append(2 * cov * rej / (cov + rej))
                row[f"{name}_f_balance"] = round(scores[-1], 4)
            row["score"] = round(float(np.mean(scores)) if scores else accept_val, 4)
            rows.append(row)

    rows.sort(key=lambda r: (-r["score"], -r["val_coverage"]))

    # Product-first operating point: keep at least COV_FLOOR of real waste
    # reports accepted, and within that constraint maximize rejection of
    # negatives (tie-break: stricter conf, then stricter margin).
    COV_FLOOR = float(os.environ.get("CALIB_COVERAGE_FLOOR", "0.80"))

    def negatives_rejection(r):
        vals = [r[k] for k in r if k.endswith("_rejected_pct") and not k.startswith("known")]
        return min(vals) if vals else None

    neg_vals = [negatives_rejection(r) for r in rows if negatives_rejection(r) is not None]
    eligible = [r for r in rows if r["val_coverage"] >= COV_FLOOR]
    if neg_vals and eligible:
        best = max(eligible,
                   key=lambda r: (negatives_rejection(r), r["conf"], r["margin"]))
        basis = f"max negative-rejection subject to val coverage >= {COV_FLOOR:.0%}"
    elif eligible:
        # no negatives available: most permissive point that meets the floor
        best = min(eligible, key=lambda r: (r["conf"], r["margin"]))
        basis = f"most permissive point meeting coverage >= {COV_FLOOR:.0%} (NO negative data)"
    else:
        best = rows[0]
        basis = "balanced-score fallback (no point met the coverage floor)"

    print("\nTop 8 operating points (by balanced score):")
    print(f"{'conf':>6}{'margin':>7}{'cov%':>7}{'knownRej%':>11}"
          + "".join(f"{k.replace('_rejected_pct',''):>16}" for k in rows[0] if k.endswith("_rejected_pct")))
    for r in rows[:8]:
        line = f"{r['conf']:>6}{r['margin']:>7}{r['val_coverage']*100:>7.1f}{r['known_rejected_pct']:>11}"
        line += "".join(f"{r[k]:>16}" for k in r if k.endswith("_rejected_pct"))
        print(line)
    print(f"\nSelected ({basis}): conf>={best['conf']} margin>={best['margin']} "
          f"coverage={best['val_coverage']*100:.1f}%")
    out = {
        "conf_threshold": best["conf"],
        "margin_threshold": best["margin"],
        "selection_basis": basis,
        "sweep_top": rows[:12],
        "negative_sets_used": list(neg_sources.keys()),
    }
    (CKPT_DIR / "thresholds.json").write_text(json.dumps(out, indent=2))
    print(f"\nSelected: conf>={best['conf']} margin>={best['margin']} -> {CKPT_DIR / 'thresholds.json'}")


if __name__ == "__main__":
    main()
