"""
SwachhLens - Dataset Preparation
Builds the unified SwachhLens taxonomy from Garbage Classification 12 + RealWaste,
removes exact duplicates, clusters near-duplicates via perceptual hash so a
cluster never spans two splits, then creates class-aware 70/15/15 splits.

Outputs:
  training/manifest.json       [{path, source, orig_label, label, split}, ...]
  training/class_mapping.json  taxonomy + rationale + operational category map

Usage:  python training/prepare_dataset.py
"""
from __future__ import annotations

import hashlib
import json
import random
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
TRAINING_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TRAINING_DIR))
from inspect_dataset import GC_DIR, RW_DIR, VALID_EXT, discover_classes, dhash, md5_of_file

SEED = 42
SPLIT_RATIOS = {"train": 0.70, "val": 0.15, "test": 0.15}
HAMMING_THRESHOLD = 6          # bits out of 64 -> same physical object variant
NEAR_DUP_SUBKEY_BITS = 16      # LSH: bucket by each quarter of the hash

# ---------------------------------------------------------------------------
# Unified SwachhLens taxonomy. Every source class maps with an explicit reason;
# questionable mappings are FLAGGED rather than silently assumed.
# ---------------------------------------------------------------------------
TAXONOMY_GC = {
    "cardboard":   ("cardboard", "Direct match - corrugated packaging material."),
    "paper":       ("paper",     "Direct match - paper sheets/newspaper."),
    "plastic":     ("plastic",   "Direct match - plastic bottles/bags/containers."),
    "metal":       ("metal",     "Direct match - cans, foil, metal scrap."),
    "biological":  ("organic",   "Food/yard scraps are the definition of organic waste."),
    "green-glass": ("glass",     "Colour variant of glass; material identical for recycling."),
    "brown-glass": ("glass",     "Colour variant of glass."),
    "white-glass": ("glass",     "Clear/colourless glass variant."),
    "clothes":     ("textile",   "Fabric garments form the textile recycling stream."),
    "shoes":       ("textile",   "FLAGGED: footwear is not strictly fabric, but municipal "
                                 "textile streams and RealWaste 'Textile Trash' both cover "
                                 "worn footwear; kept together deliberately."),
    "battery":     ("battery",   "Household batteries; operationally routed to HAZARDOUS stream."),
    "trash":       ("mixed_trash","Dataset explicitly defines 'trash' as residual/mixed waste."),
}
TAXONOMY_RW = {
    "Cardboard":         ("cardboard",  "Direct match."),
    "Paper":             ("paper",      "Direct match."),
    "Plastic":           ("plastic",    "Direct match."),
    "Metal":             ("metal",      "Direct match."),
    "Glass":             ("glass",      "Direct match."),
    "Food Organics":     ("organic",    "Food waste = organic stream."),
    "Textile Trash":     ("textile",    "Fabric/textile trash; validates shoes->textile choice above."),
    "Miscellaneous Trash":("mixed_trash","Explicitly miscellaneous/residual waste."),
    "Vegetation":        ("vegetation", "Garden/yard waste. Kept SEPARATE from food organics: "
                                         "visually distinct (leaves/branches vs food), and "
                                         "RealWaste treats it as its own class. Operationally "
                                         "merged into organic_waste downstream (FLAGGED)."),
}
UNIFIED_CLASSES = ["plastic", "paper", "cardboard", "metal", "glass",
                   "organic", "vegetation", "textile", "battery", "mixed_trash"]

# Granular CNN class -> SwachhLens operational category (backend/frontend contract).
OPERATIONAL_MAP = {
    "plastic":    "plastic_waste",
    "paper":      "paper_waste",        # NEW frontend label (additive)
    "cardboard":  "cardboard_waste",    # NEW frontend label (additive)
    "metal":      "metal_waste",        # NEW frontend label (additive)
    "glass":      "glass_waste",        # NEW frontend label (additive)
    "organic":    "organic_waste",
    "vegetation": "organic_waste",      # FLAGGED merge: garden waste joins organics stream
    "textile":    "textile_waste",      # NEW frontend label (additive)
    "battery":    "hazardous_waste",    # household batteries = hazardous stream
    "mixed_trash":"garbage_dump",
}


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def collect_records() -> list[dict]:
    tasks: list[tuple[str, str, Path]] = []
    for source, base, tax in [("gc", GC_DIR, TAXONOMY_GC), ("rw", RW_DIR, TAXONOMY_RW)]:
        classes = discover_classes(base)
        missing = set(classes) - set(tax)
        if missing:
            raise SystemExit(f"Unmapped {source} classes discovered: {missing}. Update taxonomy first!")
        for orig, paths in classes.items():
            for p in paths:
                tasks.append((source, orig, p))

    def one(task):
        source, orig, path = task
        try:
            img = Image.open(path)
            h = dhash(img)
            return {"path": str(path.relative_to(ROOT)), "source": source,
                    "orig_label": orig, "label": TAXONOMY_GC[orig][0] if source == "gc" else TAXONOMY_RW[orig][0],
                    "dhash": h}
        except Exception as e:  # noqa: BLE001
            return None

    with ThreadPoolExecutor(max_workers=12) as ex:
        records = [r for r in ex.map(one, tasks) if r]
    return records


def main() -> None:
    random.seed(SEED)
    print("Scanning images...")
    records = collect_records()
    print(f"Loaded {len(records)} images")

    # ---- 1. exact duplicates -------------------------------------------
    by_bucket: dict[str, list[dict]] = defaultdict(list)
    for r in records:
        by_bucket[r["dhash"]].append(r)

    dropped_exact: set[str] = set()
    for bucket in by_bucket.values():
        if len(bucket) < 2:
            continue
        seen_md5: dict[str, str] = {}
        for r in sorted(bucket, key=lambda x: x["path"]):
            m = md5_of_file(ROOT / r["path"])
            if m in seen_md5:
                dropped_exact.add(r["path"])
            else:
                seen_md5[m] = r["path"]
    records = [r for r in records if r["path"] not in dropped_exact]
    print(f"Dropped {len(dropped_exact)} exact duplicate copies")

    # ---- 2. near-duplicate clusters (union-find on LSH candidates) -------
    parent = list(range(len(records)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[rj] = ri

    subkey_map: dict[str, list[int]] = defaultdict(list)
    nq = 64 // NEAR_DUP_SUBKEY_BITS
    for idx, r in enumerate(records):
        v = int(r["dhash"], 16)
        for q in range(nq):
            key = f"{q}:{(v >> (q * NEAR_DUP_SUBKEY_BITS)) & ((1 << NEAR_DUP_SUBKEY_BITS) - 1):04x}"
            subkey_map[key].append(idx)

    pairs = set()
    for bucket in subkey_map.values():
        for a in range(len(bucket)):
            for b in range(a + 1, len(bucket)):
                i, j = bucket[a], bucket[b]
                if find(i) == find(j):
                    continue
                if hamming(records[i]["dhash"], records[j]["dhash"]) <= HAMMING_THRESHOLD:
                    union(i, j)
                    pairs.add((min(i, j), max(i, j)))
    clusters: dict[int, list[int]] = defaultdict(list)
    for i in range(len(records)):
        clusters[find(i)].append(i)
    multi = {c: m for c, m in clusters.items() if len(m) > 1}
    print(f"Near-duplicate clusters (>1 image): {len(multi)}, images involved: {sum(len(m) for m in multi.values())}")

    # ---- 3. stratified cluster-aware split -------------------------------
    by_class: dict[str, list[list[dict]]] = defaultdict(list)
    relabeled = 0
    for members in clusters.values():
        group = [records[i] for i in members]
        labels = Counter(g["label"] for g in group)
        cls = labels.most_common(1)[0][0]
        # A near-duplicate cluster is (almost) the same physical photo; keep the
        # majority label so one image can't appear as two classes across splits.
        if len(labels) > 1:
            for g in group:
                if g["label"] != cls:
                    g["label"] = cls
                    relabeled += 1
        by_class[cls].append(group)
    if relabeled:
        print(f"Relabeled {relabeled} images to their cluster's majority class "
              f"(near-dupes spanning multiple source labels)")

    split_of: dict[str, str] = {}
    targets = {cls: {s: SPLIT_RATIOS[s] * sum(len(g) for g in groups)
                     for s in SPLIT_RATIOS}
               for cls, groups in by_class.items()}
    filled = {cls: Counter() for cls in by_class}

    for cls in sorted(by_class):
        groups = sorted(by_class[cls], key=len, reverse=True)
        random.shuffle(groups)
        # big clusters first into train, rest round-robin to least-filled split
        for gi, group in enumerate(groups):
            if gi == 0 and len(groups) >= 3:
                s = "train"
            else:
                deficits = {s: targets[cls][s] - filled[cls][s] for s in SPLIT_RATIOS}
                s = max(deficits, key=deficits.get)
            for member in group:
                split_of[member["path"]] = s
            filled[cls][s] += len(group)

    # ---- 4. leakage verification ----------------------------------------
    violations = 0
    for i, j in pairs:
        if split_of[records[i]["path"]] != split_of[records[j]["path"]]:
            violations += 1
    print(f"Leakage check: {violations} near-duplicate pairs span splits (must be 0)")
    assert violations == 0, "Split leakage detected!"

    # ---- 5. write outputs -------------------------------------------------
    for r in records:
        r["split"] = split_of[r["path"]]

    dist = defaultdict(lambda: Counter())
    for r in records:
        dist[r["label"]][r["split"]] += 1
    print(f"\n{'class':<14}{'train':>7}{'val':>7}{'test':>7}{'total':>8}")
    total = Counter()
    for cls in UNIFIED_CLASSES:
        c = dist[cls]
        t, v, te = c["train"], c["val"], c["test"]
        total.update(c)
        print(f"{cls:<14}{t:>7}{v:>7}{te:>7}{t+v+te:>8}")
    print(f"{'TOTAL':<14}{total['train']:>7}{total['val']:>7}{total['test']:>7}"
          f"{total['train']+total['val']+total['test']:>8}")

    manifest_path = TRAINING_DIR / "manifest.json"
    manifest_path.write_text(json.dumps({"seed": SEED, "hamming_threshold": HAMMING_THRESHOLD,
                                         "classes": UNIFIED_CLASSES, "records": records}, indent=1))
    mapping_path = TRAINING_DIR / "class_mapping.json"
    mapping_path.write_text(json.dumps({
        "unified_classes": UNIFIED_CLASSES,
        "source_mapping_gc": {k: {"unified": v[0], "rationale": v[1]} for k, v in TAXONOMY_GC.items()},
        "source_mapping_rw": {k: {"unified": v[0], "rationale": v[1]} for k, v in TAXONOMY_RW.items()},
        "operational_category_map": OPERATIONAL_MAP,
        "notes": [
            "shoes->textile and Vegetation->organic_waste are FLAGGED judgement calls, documented above.",
            "Exact duplicates removed before clustering; near-dup clusters never span splits.",
        ],
    }, indent=2))
    print(f"\nSaved {manifest_path}\nSaved {mapping_path}")


if __name__ == "__main__":
    main()
