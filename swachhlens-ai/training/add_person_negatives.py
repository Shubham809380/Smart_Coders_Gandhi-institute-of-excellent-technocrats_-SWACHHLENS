"""Append STL-10 'person' images to the non-waste set (idempotent)."""
import json
import sys
from pathlib import Path

import numpy as np

TRAINING_DIR = Path(__file__).resolve().parent
OUT_DIR = TRAINING_DIR / "nonwaste"


def main() -> None:
    from torchvision.datasets import STL10
    from PIL import Image

    ds = STL10(root=str(TRAINING_DIR / "stl10"), split="train", download=False)
    person = int(np.where(ds.labels == ds.classes.index("person"))[0].shape[0])
    print("train-split person images:", person)

    d = OUT_DIR / "stl10_person"
    d.mkdir(parents=True, exist_ok=True)

    manifest_path = TRAINING_DIR / "nonwaste_manifest.json"
    records = json.loads(manifest_path.read_text())
    have = {r["path"] for r in records}
    added = 0
    for i, ci in enumerate(np.where(ds.labels == ds.classes.index("person"))[0]):
        img, _ = ds[int(ci)]  # PIL.Image (torchvision default_transform not applied)
        rel = f"nonwaste\\stl10_person\\stl10_person_{i:05d}.jpg"
        if rel in have:
            continue
        p = OUT_DIR / "stl10_person" / f"stl10_person_{i:05d}.jpg"
        img.convert("RGB").save(p, quality=90)
        records.append({"path": rel, "source": "stl10", "label": "person"})
        added += 1
    manifest_path.write_text(json.dumps(records, indent=1))
    print(f"added {added} person negatives; total negatives now {len(records)}")
    sys.exit(0)


if __name__ == "__main__":
    main()
