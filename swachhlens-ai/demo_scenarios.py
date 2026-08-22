"""
SwachhLens - Final Demo Scenarios.

Demonstrates the two-stage behaviour end to end:

  Plastic bottle -> plastic      (ACCEPTED WASTE)
  Cardboard box  -> cardboard    (ACCEPTED WASTE)
  Food waste     -> organic      (ACCEPTED WASTE)
  Metal can      -> metal        (ACCEPTED WASTE)
  Glass bottle   -> glass        (ACCEPTED WASTE)
  Car / dog / cat / ship ...     (UNKNOWN / NOT WASTE)

Positive examples come from the untouched TEST split (real evaluation data).
Negative examples come from CIFAR-10 proxy classes (car, cat, dog, truck,
ship, ...) or dataset/negative/ if the user added real photos there.

Usage:  python demo_scenarios.py
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[0]))

from models.classifier import classify_image, load_classifier  # noqa: E402

BASE = Path(__file__).resolve().parents[0]
TRAINING_DIR = BASE / "training"
ROOT = BASE.parent
NEGATIVE_DIR = ROOT / "dataset" / "negative"

DEMO_POSITIVES = [
    ("Plastic bottle", "plastic"),
    ("Cardboard box", "cardboard"),
    ("Food waste", "organic"),
    ("Metal can", "metal"),
    ("Glass bottle", "glass"),
]

# CIFAR-10 class -> demo label. These are NOT waste; model must reject them.
CIFAR_NEGATIVES = {
    "automobile": "Car",
    "cat": "Cat",
    "dog": "Dog",
    "truck": "Truck",
    "ship": "Ship",
    "bird": "Bird",
    "horse": "Horse",
}


def pick_positive(class_name: str) -> str | None:
    manifest = json.loads((TRAINING_DIR / "manifest.json").read_text())
    rng = random.Random(7)
    recs = [r["path"] for r in manifest["records"]
            if r["split"] == "test" and r["label"] == class_name]
    return str(ROOT / rng.choice(recs)) if recs else None


def gather_negatives() -> list[tuple[str, str]]:
    """Returns [(demo_label, image_path_or_pil_index_marker)]."""
    out: list[tuple[str, object]] = []
    if NEGATIVE_DIR.exists():
        imgs = sorted(p for p in NEGATIVE_DIR.rglob("*")
                      if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"})
        for p in imgs[:8]:
            out.append((p.stem, str(p)))
        if out:
            print(f"Using {len(out)} user-provided negative images from {NEGATIVE_DIR}")
            return out
    try:
        from torchvision.datasets import CIFAR10
        raw = CIFAR10(root=str(TRAINING_DIR / "cifar10"), train=False, download=True)
        rng = random.Random(7)
        by_cls: dict[str, int] = {}
        order = list(range(len(raw)))
        rng.shuffle(order)
        targets = {raw.classes[c]: c for c in range(10)}
        for i in order:
            _, y = raw[i]
            cname = raw.classes[y]
            if cname in CIFAR_NEGATIVES and cname not in by_cls:
                by_cls[cname] = i
            if len(by_cls) == len(CIFAR_NEGATIVES):
                break
        st = load_classifier()
        tf = st["tf"]

        class _CifarWrap:
            def __init__(self, ds, idx):
                self.ds, self.idx = ds, idx
            # classifier expects a path; we instead pre-render to a temp file
        # simplest: dump selected images to temp files
        import tempfile, os
        tmpdir = Path(tempfile.mkdtemp(prefix="swachhlens_demo_neg_"))
        for cname, i in by_cls.items():
            img, _ = raw[i]
            f = tmpdir / f"{CIFAR_NEGATIVES[cname]}.png"
            img.resize((192, 192)).save(f)
            out.append((f"{CIFAR_NEGATIVES[cname]} (photo)", str(f)))
        print(f"Using {len(out)} CIFAR-10 negative proxies")
    except Exception as e:  # noqa: BLE001
        print(f"No negatives available ({e}); demo will show positives only.")
    return out


def main() -> None:
    st = load_classifier()
    if not st:
        print("Classifier checkpoint missing - run training/train_classifier.py first")
        sys.exit(1)
    print("=" * 74)
    print(f"SWACHHLENS CLASSIFIER DEMO   [{st['arch']}, val macro-F1={st['val_macro_f1']}]")
    print(f"decision rule: conf >= {st['thresholds']['conf_threshold']} AND "
          f"top1-top2 margin >= {st['thresholds']['margin_threshold']}")
    print("=" * 74)

    rows = []
    for label, cls in DEMO_POSITIVES:
        p = pick_positive(cls)
        if not p:
            rows.append((label, "-", "-", "-", "NO SAMPLE"))
            continue
        r = classify_image(p)
        pred = r["top_predictions"][0]["class"] if r.get("checked") else "?"
        conf = r.get("confidence", "-")
        ok = r.get("is_waste") is True and r.get("category") == cls
        rows.append((label, pred, f"{conf}%", r.get("status", "?"),
                     "ACCEPTED WASTE" + ("" if ok else "  (!! wrong class)") ))

    for label, p in gather_negatives():
        r = classify_image(p)
        top = r["top_predictions"][0]["class"] if r.get("checked") else "?"
        conf = r.get("confidence", "-")
        rejected = r.get("checked") and not r["is_waste"]
        rows.append((label, top, f"{conf}%", r.get("status", "?"),
                     "UNKNOWN / NOT WASTE" if rejected else "  !! MISSED - accepted as waste"))

    w = max(len(r[0]) for r in rows) + 2
    print(f"\n{'Image':<{w}}{'Prediction':<14}{'Confidence':>11}  {'Status':<10} Verdict")
    print("-" * 74)
    for row in rows:
        print(f"{row[0]:<{w}}{row[1]:<14}{row[2]:>11}  {row[3]:<10} {row[4]}")

    missed = sum(1 for r in rows if "!!" in r[4])
    total = len(rows)
    print("-" * 74)
    print(f"Correct behaviour: {total - missed}/{total}")


if __name__ == "__main__":
    main()
