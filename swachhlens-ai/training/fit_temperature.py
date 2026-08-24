"""
Post-training calibration (temperature scaling).
================================================
CE/softmax model : fits T minimising NLL(softmax(logits/T), target) on the
VALIDATION split (Guo et al., 2017).

BCE multi-label model (loss == "bce_multilabel") : fits T minimising
BCE-NLL(sigmoid(logits/T), multi-hot target). The fit set includes BOTH waste
val images AND held-out non-waste negatives, because calibration must cover
the reject class too.

The fitted value is written to checkpoints/calibration.json and picked up by
the Node pipeline (backend/ai/pipeline/config.js).

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
from PIL import Image
from torchvision import transforms as T

TRAINING_DIR = Path(__file__).resolve().parent
AI_ROOT = TRAINING_DIR.parent          # swachhlens-ai/
REPO = AI_ROOT.parent                  # repo root (dataset paths are relative to it)
sys.path.insert(0, str(TRAINING_DIR))

SEED = 42


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-images", type=int, default=1500)
    args = ap.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)

    ckpt_path = AI_ROOT / "checkpoints" / "best_classifier.pth"
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    multilabel = ckpt.get("loss") == "bce_multilabel"
    classes = list(ckpt["classes"])
    n_waste = len(classes) - 1 if multilabel else len(classes)
    class_to_idx = {c: i for i, c in enumerate(classes[:n_waste])}

    from train_classifier import (make_model, ManifestDataset, NonWasteDataset,
                                 build_transforms, load_nonwaste_records)
    from torch.utils.data import DataLoader, ConcatDataset

    img_size = int(ckpt.get("img_size", 192))
    _, eval_tf = build_transforms(img_size)

    parts = []
    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    val = [r for r in manifest["records"] if r["split"] == "val"]
    random.shuffle(val)
    n_waste_imgs = args.max_images if multilabel else args.max_images
    ds_waste = ManifestDataset(val[:n_waste_imgs], eval_tf, class_to_idx)
    parts.append(("waste_val", ds_waste))

    nw_info = {"n_nonwaste": 0}
    if multilabel:
        # reuse the exact deterministic train/val split so calibration never
        # touches images the model trained on
        _, val_nw = load_nonwaste_records()
        random.shuffle(val_nw)
        ds_nw = NonWasteDataset([{**r, "path": str(r["path"])} for r in val_nw],
                                img_size, n_waste, augment=False)
        parts.append(("nonwaste_val", ds_nw))
        nw_info["n_nonwaste"] = len(ds_nw)

    loader = DataLoader(ConcatDataset([d for _, d in parts]),
                        batch_size=128, shuffle=False, num_workers=6)

    seq, feat_dim = make_model(ckpt["arch"], len(classes))
    model = nn.Sequential(seq, nn.Sequential(nn.Dropout(0.2),
                                             nn.Linear(feat_dim, len(classes))))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    logits_all, ys_all = [], []
    print(f"Fitting T on {sum(len(d) for _, d in parts)} images "
          f"({'bce_multilabel' if multilabel else 'ce_softmax'})...")
    with torch.inference_mode():
        for x, y in loader:
            logits_all.append(model(x))
            ys_all.append(y.float())
    logits = torch.cat(logits_all)
    ys = torch.cat(ys_all)
    if not multilabel:
        ys = ys.long()

    def bce_nll(t: float) -> float:
        return nn.functional.binary_cross_entropy_with_logits(
            logits / t, ys, reduction="mean").item()

    best_t, best_loss = 1.0, float("inf")
    for t in np.concatenate([np.linspace(0.3, 4.0, 75)]):
        loss = bce_nll(float(t)) if multilabel else \
            nn.functional.cross_entropy(logits / float(t), ys).item()
        if loss < best_loss:
            best_t, best_loss = float(t), loss
    base_loss = bce_nll(1.0) if multilabel else \
        nn.functional.cross_entropy(logits, ys).item()

    out = {
        "temperature": round(best_t, 4),
        "mode": "bce_multilabel" if multilabel else "ce_softmax",
        "val_nll_at_T": round(best_loss, 5),
        "val_nll_uncalibrated": round(base_loss, 5),
        "arch": ckpt["arch"],
        "n_images": sum(len(d) for _, d in parts),
        **nw_info,
    }

    # ---- operating-point sweep -> router thresholds -------------------------
    # Policy identical to calibrate_threshold.py: maximise negative rejection
    # subject to waste coverage >= 80% on this fit set. For BCE models the
    # signals are the calibrated top sigmoid and the top-1/top-2 sigmoid gap.
    if multilabel:
        with torch.inference_mode():
            probs = torch.sigmoid(logits / best_t)
        top2 = probs[:, :n_waste].topk(min(2, n_waste), dim=1).values
        conf = top2[:, 0]
        margin = (top2[:, 0] - top2[:, 1]) if top2.shape[1] > 1 else torch.ones_like(conf)
        is_neg = ys[:, -1] > 0.5
        is_pos = (~is_neg) & (ys[:, :n_waste].max(1).values > 0.05)
        best_point = None
        for c_thr in np.arange(0.50, 0.96, 0.02):
            for m_thr in np.arange(0.05, 0.60, 0.05):
                accept = (conf >= c_thr) & (margin >= m_thr)
                cov = float((accept & is_pos).float().sum()) / max(int(is_pos.sum()), 1)
                rej = float(((~accept) & is_neg).float().sum()) / max(int(is_neg.sum()), 1)
                if cov >= 0.80 and (best_point is None or rej > best_point["negative_rejection"]):
                    best_point = {"conf_threshold": round(float(c_thr), 3),
                                  "margin_threshold": round(float(m_thr), 3),
                                  "waste_coverage": round(cov, 4),
                                  "negative_rejection": round(rej, 4)}
        if best_point:
            out["router_overrides"] = {
                "autoAcceptProb": best_point["conf_threshold"],
                "fastPathMinMargin": best_point["margin_threshold"],
                "_policy": ("max negative rejection s.t. waste coverage>=0.80; "
                            f"coverage={best_point['waste_coverage']}, "
                            f"rejection={best_point['negative_rejection']}"),
            }
            print("router_overrides:", out["router_overrides"])

    out_path = AI_ROOT / "checkpoints" / "calibration.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(json.dumps(out))
    print(f"Saved -> {out_path}")


if __name__ == "__main__":
    main()
