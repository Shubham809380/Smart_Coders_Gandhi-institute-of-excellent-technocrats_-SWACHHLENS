"""
Post-training temperature scaling (Guo et al., 2017).
=====================================================
Fits a single scalar T that minimises NLL(softmax(logits/T), target) on the
VALIDATION split — never on train, never during training. The fitted value is
written to checkpoints/calibration.json and picked up by the Node pipeline
(backend/ai/pipeline/config.js) to calibrate sigmoid scores at inference.

Usage:  python training/fit_temperature.py [--max-images 1500]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

TRAINING_DIR = Path(__file__).resolve().parent
ROOT = TRAINING_DIR.parents[1]
sys.path.insert(0, str(TRAINING_DIR))

SEED = 42


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=1500)
    args = ap.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)

    ckpt_path = ROOT / "swachhlens-ai" / "checkpoints" / "best_classifier.pth"
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)

    from train_classifier import make_model, ManifestDataset, build_transforms
    from torch.utils.data import DataLoader

    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    classes = manifest["classes"]
    class_to_idx = {c: i for i, c in enumerate(classes)}
    val = [r for r in manifest["records"] if r["split"] == "val"]
    random.shuffle(val)
    val = val[: args.max_images]

    _, eval_tf = build_transforms(int(ckpt.get("img_size", 192)))
    ds = ManifestDataset(val, eval_tf, class_to_idx)
    loader = DataLoader(ds, batch_size=128, shuffle=False, num_workers=6)

    model = nn.Sequential(*make_model(arch := ckpt["arch"], len(classes))[0:1],
                          nn.Sequential(nn.Dropout(0.2),
                                        nn.Linear(make_model(arch, len(classes))[1], len(classes))))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    logits_all, ys_all = [], []
    print(f"Fitting T on {len(ds)} val images ({arch})...")
    with torch.inference_mode():
        for x, y in loader:
            logits_all.append(model(x))
            ys_all.append(y)
    logits = torch.cat(logits_all)
    ys = torch.cat(ys_all)

    # Grid + refinement around the best T (NLL is 1-D convex in T).
    best_t, best_nll = 1.0, float("inf")
    grid = np.concatenate([np.linspace(0.3, 4.0, 75)])
    for t in grid:
        nll = nn.functional.cross_entropy(logits / float(t), ys).item()
        if nll < best_nll:
            best_t, best_nll = float(t), nll
    base_nll = nn.functional.cross_entropy(logits, ys).item()
    acc = (logits.argmax(1) == ys).float().mean().item()

    out = {
        "temperature": round(best_t, 4),
        "val_nll_at_T": round(best_nll, 5),
        "val_nll_uncalibrated": round(base_nll, 5),
        "val_accuracy": round(acc, 4),
        "arch": ckpt["arch"],
        "n_images": len(ds),
    }
    out_path = ROOT / "swachhlens-ai" / "checkpoints" / "calibration.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(json.dumps(out))
    print(f"Saved -> {out_path}")


if __name__ == "__main__":
    main()
