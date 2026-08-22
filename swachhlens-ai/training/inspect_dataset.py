"""
SwachhLens - Dataset Inspection
Scans garbage_classification (12 classes) and realwaste-main/RealWaste (9 classes),
reports counts, dimensions, corrupted files, duplicates (exact + perceptual),
and class imbalance. Writes training/dataset_report.json.

Usage:  python training/inspect_dataset.py
"""
from __future__ import annotations

import json
import os
import sys
import hashlib
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]          # repo root (E:\ESSPL Project)
GC_DIR = ROOT / "garbage_classification"
RW_DIR = ROOT / "realwaste-main" / "RealWaste"
OUT_PATH = Path(__file__).resolve().parent / "dataset_report.json"

VALID_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def dhash(img: Image.Image, size: int = 8) -> str:
    """Difference hash -> 64-bit hex string. Robust, dependency-free."""
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for row in range(size):
        for col in range(size):
            bits = (bits << 1) | (1 if px[row * (size + 1) + col] > px[row * (size + 1) + col + 1] else 0)
    return f"{bits:016x}"


def md5_of_file(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def scan_image(path: Path):
    """Returns dict of info for one image, or error marker."""
    try:
        with Image.open(path) as img:
            img.load()  # force decode -> catches truncated/corrupt files
            w, h = img.size
            mode = img.mode
        return {
            "path": str(path.relative_to(ROOT)),
            "source": path.parts[0],
            "label": path.parent.name,
            "width": w,
            "height": h,
            "mode": mode,
            "bytes": path.stat().st_size,
            "md5": None,      # filled by caller if needed
            "dhash": dhash(Image.open(path)),
        }
    except Exception as e:  # noqa: BLE001 - report every bad file
        return {"path": str(path.relative_to(ROOT)), "source": path.parts[0],
                "label": path.parent.name, "error": f"{type(e).__name__}: {e}"}


def discover_classes(base: Path) -> dict[str, list[Path]]:
    """Do NOT assume folder layout: accept <base>/<class>/<img> or <base>/<img>."""
    classes: dict[str, list[Path]] = defaultdict(list)
    if not base.exists():
        return classes
    for entry in sorted(base.iterdir()):
        if entry.is_dir():
            files = [p for p in entry.rglob("*") if p.suffix.lower() in VALID_EXT]
            if files:
                classes[entry.name].extend(files)
        elif entry.suffix.lower() in VALID_EXT:
            classes["<root>"].append(entry)
    return classes


def main() -> None:
    report: dict = {"datasets": {}, "generated_with": f"Python {sys.version.split()[0]}"}

    all_records: list[dict] = []

    for name, base in [("garbage_classification_12", GC_DIR), ("realwaste", RW_DIR)]:
        print(f"\n=== Scanning {name}: {base} ===")
        classes = discover_classes(base)
        ds_report: dict = {"root": str(base), "classes": {}, "corrupted": []}

        tasks = [p for paths in classes.values() for p in paths]
        print(f"Found {len(tasks)} candidate images across {len(classes)} folders")

        with ThreadPoolExecutor(max_workers=12) as ex:
            results = list(ex.map(scan_image, tasks))

        dims_counter: Counter = Counter()
        total_ok = 0
        for rec in results:
            if "error" in rec:
                ds_report["corrupted"].append(rec)
                print(f"  CORRUPT: {rec['path']}  ({rec['error']})")
                continue
            total_ok += 1
            cls = rec["label"]
            all_records.append(rec)
            c = ds_report["classes"].setdefault(cls, {"count": 0, "min_w": 10**9, "min_h": 10**9,
                                                      "max_w": 0, "max_h": 0})
            c["count"] += 1
            c["min_w"], c["max_w"] = min(c["min_w"], rec["width"]), max(c["max_w"], rec["width"])
            c["min_h"], c["max_h"] = min(c["min_h"], rec["height"]), max(c["max_h"], rec["height"])
            dims_counter[(rec["width"], rec["height"])] += 1

        ds_report["total_images"] = total_ok
        ds_report["num_classes"] = len(ds_report["classes"])
        ds_report["top_dimensions"] = [
            {"w": w, "h": h, "count": n} for (w, h), n in dims_counter.most_common(5)
        ]
        report["datasets"][name] = ds_report

        print(f"OK images: {total_ok}, corrupted: {len(ds_report['corrupted'])}")
        for cls, c in sorted(ds_report["classes"].items(), key=lambda kv: -kv[1]["count"]):
            print(f"  {cls:<22} {c['count']:>6}   ({c['min_w']}x{c['min_h']} .. {c['max_w']}x{c['max_h']})")

    # ---- duplicates ------------------------------------------------------
    print("\n=== Duplicate analysis ===")
    by_md5: dict[str, list] = defaultdict(list)
    # md5 is expensive over ~20k files once; reuse dhash buckets instead and
    # verify bucket collisions with md5.
    by_dhash: dict[str, list] = defaultdict(list)
    for rec in all_records:
        by_dhash[rec["dhash"]].append(rec)

    exact_dupes: list[list[str]] = []
    for bucket in by_dhash.values():
        if len(bucket) > 1:
            hashes = {}
            for rec in bucket:
                hashes.setdefault(md5_of_file(ROOT / rec["path"]), []).append(rec["path"])
            for h, paths in hashes.items():
                if len(paths) > 1:
                    exact_dupes.append(paths)
    cross_source_exact = [d for d in exact_dupes if len({p.split('\\')[0].split('/')[0] for p in d}) > 1]

    report["duplicates"] = {
        "exact_duplicate_groups": len(exact_dupes),
        "exact_duplicate_images": sum(len(d) - 1 for d in exact_dupes),
        "cross_dataset_exact_duplicates": len(cross_source_exact),
        "examples": exact_dupes[:10],
    }
    print(f"Exact duplicate groups: {len(exact_dupes)} "
          f"(extra copies: {report['duplicates']['exact_duplicate_images']})")
    print(f"Cross-dataset exact dupes: {len(cross_source_exact)}")

    # ---- imbalance -------------------------------------------------------
    label_counts = Counter(rec["label"] for rec in all_records)
    counts = sorted(label_counts.values())
    report["imbalance"] = {
        "max_class": label_counts.most_common(1)[0],
        "min_class": label_counts.most_common()[-1],
        "imbalance_ratio": round(counts[-1] / max(1, counts[0]), 2),
    }
    print(f"Imbalance ratio (max/min): {report['imbalance']['imbalance_ratio']} "
          f"({report['imbalance']['max_class'][0]} vs {report['imbalance']['min_class'][0]})")

    OUT_PATH.write_text(json.dumps(report, indent=2))
    print(f"\nReport saved -> {OUT_PATH}")


if __name__ == "__main__":
    main()
