"""
Build the NON-WASTE (negative) training set.
============================================
The production classifier previously had no reject class: any photo — a selfie,
a dog, a car — was forced into one of 10 waste categories. This script assembles
hard negatives so `non_waste` can be trained as a REAL class (RULE 5).

Sources (all recorded per-sample in nonwaste_manifest.json for provenance):
  1. cifar10_<class>   : CIFAR-10 test split classes that are unambiguously
                         NOT waste: animals (bird/cat/deer/dog/frog/horse) and
                         vehicles (airplane/automobile/ship/truck). Cached
                         locally at training/cifar10 (~170MB, auto-download).
  2. synthetic_doc     : programmatic documents/screenshots — white canvases
                         with text-like line blocks / window chrome. Cheap,
                         effective OOD negatives for "documents/screenshots"
                         from the negative taxonomy.
  3. stl10_person      : STL-10 labeled 'person' images (96px) when the archive
                         can be downloaded; covers selfies/portraits/people.
                         OPTIONAL — skipped gracefully if unavailable.

Usage:
    python training/build_nonwaste_set.py [--per-cifar-class 250]
                                          [--synthetic-docs 400]
                                          [--with-stl10-people]

Output:
    training/nonwaste/<source>_<label>/*.jpg
    training/nonwaste_manifest.json   [{path, source, label}, ...]
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw

import numpy as np

TRAINING_DIR = Path(__file__).resolve().parent
OUT_DIR = TRAINING_DIR / "nonwaste"

# CIFAR-10 classes that are never municipal waste.
CIFAR_NEGATIVE_CLASSES = ["bird", "cat", "deer", "dog", "frog", "horse",
                          "airplane", "automobile", "ship", "truck"]
SEED = 42


def save(img: Image.Image, subdir: str, idx: int) -> Path:
    d = OUT_DIR / subdir
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"{subdir}_{idx:05d}.jpg"
    img.convert("RGB").save(p, quality=90)
    return p


def build_cifar(per_class: int) -> list[dict]:
    from torchvision.datasets import CIFAR10
    raw = CIFAR10(root=str(TRAINING_DIR / "cifar10"), train=False, download=True)
    targets = np.array(raw.targets)
    records = []
    for cls in CIFAR_NEGATIVE_CLASSES:
        cls_idx = np.where(targets == raw.class_to_idx[cls])[0][:per_class]
        for i, ci in enumerate(cls_idx):
            img, _ = raw[int(ci)]
            p = save(img, f"cifar10_{cls}", i)
            records.append({"path": str(p.relative_to(TRAINING_DIR)), "source": "cifar10", "label": cls})
    print(f"cifar10 negatives: {len(records)}")
    return records


def rnd_gray(draw_type: str, rng: random.Random) -> tuple[int, int, int]:
    base = 235 if draw_type == "doc" else rng.randint(40, 90)
    j = lambda: max(0, min(255, base + rng.randint(-12, 12)))
    return (j(), j(), j())


def build_synthetic_docs(count: int) -> list[dict]:
    """Documents/screenshots: light canvas with dark text-line or UI blocks."""
    rng = random.Random(SEED)
    records = []
    for i in range(count):
        w, h = rng.choice([(768, 1024), (720, 1280), (1080, 810)])
        kind = rng.choice(["document", "screenshot"])
        bg = (255, 255, 255) if kind == "document" else rnd_gray("shot", rng)
        img = Image.new("RGB", (w, h), bg)
        dr = ImageDraw.Draw(img)
        if kind == "document":
            y = rng.randint(60, 140)
            while y < h - 80:
                x = rng.randint(40, 70)
                width = rng.randint(int(w * 0.4), int(w * 0.9))
                while x < min(width, w - 50):
                    seg = rng.randint(30, 120)
                    shade = rng.randint(40, 110)
                    dr.rectangle([x, y, min(x + seg, w - 40), y + rng.randint(6, 11)], fill=(shade,) * 3)
                    x += seg + rng.randint(8, 18)
                y += rng.randint(22, 34)
        else:
            # app window chrome + content cards
            dr.rectangle([0, 0, w, int(h * 0.08)], fill=rnd_gray("shot", rng))
            for _ in range(rng.randint(3, 7)):
                cy = rng.randint(int(h * 0.12), h - 160)
                ch = rng.randint(60, 150)
                dr.rounded_rectangle([rng.randint(20, 60), cy,
                                      w - rng.randint(20, 60), cy + ch],
                                     radius=12, outline=(200, 200, 205), width=3)
        if rng.random() < 0.5:
            img = img.rotate(rng.uniform(-2, 2), expand=False, fillcolor=bg)
        p = save(img, f"synthetic_{kind}", i)
        records.append({"path": str(p.relative_to(TRAINING_DIR)), "source": "synthetic", "label": kind})
    print(f"synthetic doc/screenshot negatives: {len(records)}")
    return records


def build_stl10_people() -> list[dict]:
    try:
        from torchvision.datasets import STL10
        ds = STL10(root=str(TRAINING_DIR / "stl10"), split="train", download=True)
        person_idx = ds.labels == ds.classes.index("person")
        records = []
        for i, ci in enumerate(np.where(person_idx)[0]):
            img, _ = ds[int(ci)]  # PIL image via torchvision default
            p = save(img, "stl10_person", i)
            records.append({"path": str(p.relative_to(TRAINING_DIR)), "source": "stl10", "label": "person"})
        print(f"stl10 person negatives: {len(records)}")
        return records
    except Exception as e:  # noqa: BLE001
        print(f"STL-10 unavailable ({e}); skipping person negatives "
              f"(person coverage must come from hard-negative mining later)")
        return []


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-cifar-class", type=int, default=220)
    ap.add_argument("--synthetic-docs", type=int, default=400)
    ap.add_argument("--with-stl10-people", action="store_true",
                    help="attempt ~2.6GB STL-10 download for real 'person' images")
    args = ap.parse_args()

    random.seed(SEED)
    if OUT_DIR.exists():
        print(f"Reusing existing {OUT_DIR} (delete it to rebuild).")
    else:
        recs = []
        recs += build_cifar(args.per_cifar_class)
        recs += build_synthetic_docs(args.synthetic_docs)
        if args.with_stl10_people:
            recs += build_stl10_people()
        (OUT_DIR.parent / "nonwaste_manifest.json").write_text(json.dumps(recs, indent=1))

    manifest = json.loads((OUT_DIR.parent / "nonwaste_manifest.json").read_text())
    from collections import Counter
    print("Totals by source:", dict(Counter(r["source"] for r in manifest)))
    print("Totals by label:", dict(Counter(r["label"] for r in manifest)))
    print(f"TOTAL negatives: {len(manifest)}")


if __name__ == "__main__":
    main()
