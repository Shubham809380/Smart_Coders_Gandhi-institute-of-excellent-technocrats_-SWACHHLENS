"""
SwachhLens - CNN Waste Classifier (Stage 2) with calibrated unknown rejection.

Loads checkpoints/best_classifier.pth (transfer-learned on the unified
Garbage12 + RealWaste taxonomy) and applies the calibrated decision rule from
checkpoints/thresholds.json:

    accept  if max_softmax >= conf_threshold AND (top1 - top2) >= margin_threshold
    reject  otherwise -> UNKNOWN / NOT WASTE

This is the fix for "Person -> Plastic, Car -> Trash": images that are not
waste now fall below the calibrated confidence/margin bar instead of being
forced into one of the training classes.
"""
from __future__ import annotations

import json
import logging
import threading
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms

logger = logging.getLogger("swachhlens-ai.classifier")

CKPT_DIR = Path(__file__).resolve().parents[1] / "checkpoints"
IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

_lock = threading.Lock()
_state: dict | None = None


def _build_model(arch: str, num_classes: int):
    from training.train_classifier import make_model  # architecture factory only
    seq, feat_dim = make_model(arch, num_classes)
    head = nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, num_classes))
    return nn.Sequential(seq, head)


def load_classifier() -> dict:
    """Lazy singleton; returns internal state dict. Never raises at call time."""
    global _state
    if _state is not None:
        return _state
    with _lock:
        if _state is not None:
            return _state
        try:
            ckpt = torch.load(CKPT_DIR / "best_classifier.pth", map_location="cpu",
                              weights_only=False)
            model = _build_model(ckpt["arch"], len(ckpt["classes"]))
            model.load_state_dict(ckpt["state_dict"])
            model.eval()
            thresholds = {"conf_threshold": 0.60, "margin_threshold": 0.05}
            th_path = CKPT_DIR / "thresholds.json"
            if th_path.exists():
                thresholds.update({
                    k: v for k, v in json.loads(th_path.read_text()).items()
                    if k in ("conf_threshold", "margin_threshold")
                })
            op_map = {}
            mapping_path = Path(__file__).resolve().parents[1] / "training" / "class_mapping.json"
            if mapping_path.exists():
                op_map = json.loads(mapping_path.read_text()).get("operational_category_map", {})
            img_size = int(ckpt.get("img_size", 192))
            tf = transforms.Compose([
                transforms.Resize((img_size, img_size)),
                transforms.ToTensor(),
                transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
            ])
            _state = {
                "model": model,
                "tf": tf,
                "classes": ckpt["classes"],
                "op_map": op_map,
                "thresholds": thresholds,
                "arch": ckpt["arch"],
                "img_size": img_size,
                "val_macro_f1": ckpt.get("metrics", {}).get("val_macro_f1"),
            }
            logger.info("Classifier ready: %s (val macro-F1 %.3f, conf>=%.2f, margin>=%.2f)",
                        ckpt["arch"], _state["val_macro_f1"] or -1,
                        thresholds["conf_threshold"], thresholds["margin_threshold"])
        except Exception as e:  # noqa: BLE001
            logger.warning("Classifier unavailable (fallback to detector-only): %s", e)
            _state = {}
        return _state


def classify_image(image_path: str) -> dict:
    """
    Returns the SwachhLens classification contract:

      accepted: {is_waste: True,  category, wasteType, confidence(0-100),
                 status: "accepted", top_predictions[3], rejection_reason: None}
      rejected: {is_waste: False, category: "unknown", wasteType: "unknown",
                 status: "rejected", top_predictions[3], rejection_reason}

    Never raises: any failure returns checked=False so callers can fall back.
    """
    st = load_classifier()
    if not st:
        return {"checked": False}
    try:
        img = Image.open(image_path).convert("RGB")
        x = st["tf"](img).unsqueeze(0)
        with torch.inference_mode():
            probs = torch.softmax(st["model"](x), dim=1)[0]
        top = torch.topk(probs, k=min(3, len(st["classes"])))
        top_predictions = [
            {"class": st["classes"][i], "confidence": round(float(p) * 100, 1)}
            for p, i in zip(top.values.tolist(), top.indices.tolist())
        ]
        best_p = float(top.values[0])
        second_p = float(top.values[1]) if len(top.values) > 1 else 1.0
        margin = best_p - second_p
        ct = st["thresholds"]["conf_threshold"]
        mt = st["thresholds"]["margin_threshold"]

        accepted = best_p >= ct and margin >= mt
        category = st["classes"][int(top.indices[0])]
        return {
            "checked": True,
            "is_waste": bool(accepted),
            "category": category if accepted else "unknown",
            "wasteType": st["op_map"].get(category, "garbage_dump") if accepted else "unknown",
            "confidence": round(best_p * 100, 1),
            "status": "accepted" if accepted else "rejected",
            "rejection_reason": None if accepted else (
                "low_confidence" if best_p < ct else "ambiguous_margin"),
            "top_predictions": top_predictions,
            "decision_rule": {"conf_threshold": ct, "margin_threshold": mt},
        }
    except Exception as e:  # noqa: BLE001
        logger.warning("classify_image failed (fail-open): %s", e)
        return {"checked": False}


def classifier_status() -> dict:
    st = load_classifier()
    if not st:
        return {"loaded": False}
    return {
        "loaded": True,
        "architecture": st["arch"],
        "classes": st["classes"],
        "img_size": st["img_size"],
        "val_macro_f1": st["val_macro_f1"],
        "thresholds": st["thresholds"],
    }
