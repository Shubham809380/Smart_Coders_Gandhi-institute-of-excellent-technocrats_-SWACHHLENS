"""
Compare the Python pipeline (main.py logic with slim-mode flags) against the
Node ONNX provider output for the same images.
"""
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("USE_YOLO", "false")
os.environ.setdefault("USE_SAM", "false")
os.environ.setdefault("USE_DEPTH", "false")
os.environ.setdefault("USE_CLIP", "false")
os.environ.setdefault("USE_XGBOOST", "false")

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from models.detector import detect_waste  # noqa: E402
from models.classifier import classify_image  # noqa: E402
from models.volume import estimate_volume  # noqa: E402
from models.severity import score_severity  # noqa: E402
from models.dispatch import recommend_action  # noqa: E402

manifest = json.loads((ROOT / "training" / "manifest.json").read_text())
test_recs = [r for r in manifest["records"] if r.get("split") == "test"]

seen = set()
picked = []
for r in test_recs:
    if r["label"] not in seen:
        seen.add(r["label"])
        picked.append(r)
    if len(picked) >= int(sys.argv[1] if len(sys.argv) > 1 else 4):
        break

dataset_root = ROOT.parent
print(f"{'label':<12} {'wasteType':<18} {'conf':<7} {'volume':<8} {'score':<9} {'sev':<8} team")
for rec in picked:
    img_path = str(dataset_root / rec["path"])
    if not Path(img_path).exists():
        continue

    cls = classify_image(img_path)
    top_det, _all = detect_waste(img_path)
    bbox = top_det["bbox"] if top_det else None
    if bbox is None:
        from PIL import Image as I
        with I.open(img_path) as im:
            w, h = im.size
        bbox = [0, 0, w, h]

    waste_type = cls.get("wasteType") if cls.get("checked") else top_det["class"]
    confidence = cls.get("confidence", 0)
    vol_cat, vol_score = estimate_volume(img_path, bbox)
    sev = score_severity(waste_type=waste_type, volume_category=vol_cat,
                         confidence=confidence, report_frequency=1,
                         age_hours=0, location_sensitivity=0.3)
    disp = recommend_action(waste_type, vol_cat, sev["severity"])
    print(f"{rec['label']:<12} {waste_type:<18} {confidence:<7} {vol_cat:<8} "
          f"{vol_score:<9.1f} {sev['severity']:<8} {disp['team']}")
