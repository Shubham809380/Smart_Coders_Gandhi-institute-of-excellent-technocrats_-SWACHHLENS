"""
Multi-label test-set evaluation + dataset report (Steps 6 & 20).
================================================================
Run AFTER training completes. Produces checkpoints/eval_report_multilabel.json:
subset accuracy, macro/micro F1@0.5, per-class P/R/F1, AUROC, average precision,
non_waste block (rejection/precision/recall/waste-FPR/person-rejection),
dataset counts per class per split, and known-limits notes.

Usage: python training/evaluate_multilabel.py [--max-test 4000]
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.metrics import (average_precision_score, f1_score,
                             precision_recall_fscore_support, roc_auc_score)
from torch.utils.data import DataLoader

TRAINING_DIR = Path(__file__).resolve().parent
AI_ROOT = TRAINING_DIR.parent
REPO = AI_ROOT.parent
sys.path.insert(0, str(TRAINING_DIR))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SEED = 42


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-test", type=int, default=4000)
    args = ap.parse_args()

    random.seed(SEED)
    torch.manual_seed(SEED)

    ckpt = torch.load(AI_ROOT / "checkpoints" / "best_classifier.pth",
                      map_location="cpu", weights_only=False)
    if ckpt.get("loss") != "bce_multilabel":
        print("checkpoint is not bce_multilabel; run evaluate_classifier.py instead")
        return
    classes = list(ckpt["classes"])          # 11 incl non_waste
    n_waste = len(classes) - 1
    img_size = int(ckpt.get("img_size", 192))

    from train_classifier import (ManifestDataset, NonWasteDataset,
                                  build_transforms, load_manifest,
                                  load_nonwaste_records, make_model)
    _, eval_tf = build_transforms(img_size)
    seq, feat_dim = make_model(ckpt["arch"], len(classes))
    model = nn.Sequential(seq, nn.Sequential(nn.Dropout(0.2),
                                             nn.Linear(feat_dim, len(classes))))
    model.load_state_dict(ckpt["state_dict"])
    model.eval().to(DEVICE)

    _, class_to_idx, by_split, _ = load_manifest()
    test = by_split["test"][: args.max_test]
    ds_waste = ManifestDataset(test, eval_tf, class_to_idx)
    _, nw_val = load_nonwaste_records()
    ds_neg = NonWasteDataset(nw_val, img_size, n_waste, augment=False)

    def collect(ds):
        ps, ys = [], []
        dl = DataLoader(ds, batch_size=128, shuffle=False, num_workers=4)
        with torch.inference_mode():
            for x, y in dl:
                ps.append(torch.sigmoid(model(x.to(DEVICE))).cpu())
                yv = torch.zeros(len(y), len(classes))
                if isinstance(y, torch.Tensor) and y.ndim == 2:
                    yv[:, :] = y
                else:
                    for i, t in enumerate(y):
                        yv[i, int(t)] = 1.0
                ys.append(yv)
        return torch.cat(ps).numpy(), torch.cat(ys).numpy()

    print(f"scoring {len(ds_waste)} waste-test + {len(ds_neg)} negatives...")
    p_pos, y_pos = collect(ds_waste)
    p_neg, _ = collect(ds_neg)
    probs = np.concatenate([p_pos, p_neg])
    truth = np.concatenate([y_pos, np.tile(np.eye(len(classes))[-1], (len(p_neg), 1))])
    pred = (probs >= 0.5).astype(int)

    report = {
        "loss": ckpt["loss"],
        "arch": ckpt["arch"],
        "img_size": img_size,
        "n_test_waste": int(len(p_pos)),
        "n_holdout_negative": int(len(p_neg)),
        "subset_accuracy": round(float((pred == truth).all(axis=1).mean()), 4),
        "macro_f1_at_05": round(float(f1_score(truth, pred, average="macro", zero_division=0)), 4),
        "micro_f1_at_05": round(float(f1_score(truth, pred, average="micro", zero_division=0)), 4),
        "per_class": {},
        "auroc": {},
        "average_precision": {},
        "nonwaste": {},
        "dataset_report": dataset_report(),
        "known_limits": known_limits(),
    }

    P, R, F1, sup = precision_recall_fscore_support(truth, pred, zero_division=0)
    for i, c in enumerate(classes):
        report["per_class"][c] = {"precision": round(float(P[i]), 3),
                                  "recall": round(float(R[i]), 3),
                                  "f1": round(float(F1[i]), 3),
                                  "support": int(sup[i])}
        for key, fn in (("auroc", roc_auc_score), ("average_precision", average_precision_score)):
            try:
                report[key][c] = round(float(fn(truth[:, i], probs[:, i])), 4)
            except ValueError:
                report[key][c] = None

    nw_i = classes.index("non_waste")
    neg_any_waste = pred[len(p_pos):, :n_waste].sum(axis=1) > 0
    report["nonwaste"] = {
        "rejection_rate": round(float((pred[len(p_pos):, nw_i] > 0).mean()), 4),
        "precision": report["per_class"]["non_waste"]["precision"],
        "recall": report["per_class"]["non_waste"]["recall"],
        "waste_fpr_on_negatives": round(float(neg_any_waste.mean()), 4),
        "person_rejection_rate": person_rejection(model, classes, img_size, nw_val),
    }

    out = AI_ROOT / "checkpoints" / "eval_report_multilabel.json"
    out.write_text(json.dumps(report, indent=2))
    slim = {k: v for k, v in report.items() if k not in ("dataset_report", "known_limits")}
    print(json.dumps(slim, indent=1))
    print(f"saved -> {out}")


def person_rejection(model, classes, img_size, nw_val) -> float | None:
    """Share of held-out person portraits rejected at @0.5 (reject class fires
    OR no waste class does) under the fitted temperature."""
    persons = [r for r in nw_val if r.get("label") == "person"]
    if not persons:
        return None
    from PIL import Image
    from torchvision import transforms as T
    tf = T.Compose([T.Resize((img_size, img_size)), T.ToTensor(),
                    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    temp = 1.0
    calib = AI_ROOT / "checkpoints" / "calibration.json"
    if calib.exists():
        temp = max(0.1, float(json.loads(calib.read_text()).get("temperature", 1.0)))
    nw_i = classes.index("non_waste")
    xs = [tf(Image.open(TRAINING_DIR / r["path"]).convert("RGB")) for r in persons]
    with torch.inference_mode():
        preds = (torch.sigmoid(model(torch.stack(xs).to(DEVICE)) / temp).cpu() >= 0.5)
    rejected = sum(1 for row in preds if bool(row[nw_i]) or row[:nw_i].sum() == 0)
    return round(rejected / len(persons), 4)


def dataset_report() -> dict:
    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    counts: dict[str, dict] = {}
    for r in manifest["records"]:
        counts.setdefault(r["label"], {"train": 0, "val": 0, "test": 0})
        counts[r["label"]][r["split"]] += 1
    nw = json.loads((TRAINING_DIR / "nonwaste_manifest.json").read_text())
    tr, va = load_nonwaste_records()
    counts["non_waste"] = {
        "train": len(tr), "val": len(va), "test": 0,
        "by_source": dict(Counter(r["source"] for r in nw)),
        "by_label": dict(Counter(r["label"] for r in nw)),
    }
    total = {s: sum(c[s] for c in counts.values()) for s in ("train", "val", "test")}
    return {"per_class": counts, "totals": total,
            "note": "non_waste has no test split; its holdout IS the val part "
                    "(reported above) and is never trained on."}


def known_limits() -> list[str]:
    return [
        "CIFAR-10 negatives are 32px upscaled to 192px - blurrier than real photos.",
        "LFW covers frontal portrait faces only; full-body/group/street scenes "
        "with people are NOT represented and rely on the Gemini verifier.",
        "Synthetic documents/screenshots are programmatic; real phone screenshots "
        "may differ.",
        "No food-plate/furniture/indoor-scene negatives; mine production "
        "inference_logs to close these gaps next round.",
    ]


if __name__ == "__main__":
    main()
