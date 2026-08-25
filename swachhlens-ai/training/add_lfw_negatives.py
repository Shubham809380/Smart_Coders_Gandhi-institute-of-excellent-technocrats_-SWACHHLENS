"""Extract person portraits from the bitmind/lfw parquet into nonwaste/lfw_person."""
import io
import json
from pathlib import Path

TRAINING_DIR = Path(__file__).resolve().parent
OUT_DIR = TRAINING_DIR / "nonwaste" / "lfw_person"
MAX_IMAGES = 1200   # plenty for a reject class; keeps epoch time sane


def main() -> None:
    import pandas as pd
    from PIL import Image

    pq = next((TRAINING_DIR / "lfw_hf" / "data").glob("*.parquet"))
    df = pd.read_parquet(pq, columns=None)
    img_col = "image" if "image" in df.columns else df.columns[0]
    print("parquet rows:", len(df), "| image column:", img_col)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = TRAINING_DIR / "nonwaste_manifest.json"
    records = json.loads(manifest_path.read_text())
    have = {r["path"] for r in records}
    added, i = 0, 0
    for raw in df[img_col]:
        if added >= MAX_IMAGES:
            break
        try:
            data = raw["bytes"] if isinstance(raw, dict) else raw
            img = Image.open(io.BytesIO(data)).convert("RGB")
        except Exception:
            continue
        rel = f"nonwaste\\lfw_person\\lfw_{i:05d}.jpg"
        if rel in have:
            i += 1
            continue
        img.save(OUT_DIR / f"lfw_{i:05d}.jpg", quality=90)
        records.append({"path": rel, "source": "lfw", "label": "person"})
        added += 1
        i += 1
    manifest_path.write_text(json.dumps(records, indent=1))
    print(f"added {added} person negatives; total now {len(records)}")


if __name__ == "__main__":
    main()
