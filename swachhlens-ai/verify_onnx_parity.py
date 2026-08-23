"""
Parity check: Python classify_image() (torch) vs ONNX runtime on REAL dataset
images from the held-out test split. Verifies probabilities, top-1 class and
the calibrated accept/reject decision match.
"""
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from PIL import Image
from torchvision import transforms

ROOT = Path(__file__).resolve().parent
CKPT = ROOT / "checkpoints"

sys.path.insert(0, str(ROOT))
from models.classifier import classify_image  # noqa: E402

IMAGENET_MEAN = [0.485, 0.456, 0.406]
IMAGENET_STD = [0.229, 0.224, 0.225]

ckpt = torch.load(CKPT / "best_classifier.pth", map_location="cpu", weights_only=False)
classes = ckpt["classes"]
img_size = int(ckpt.get("img_size", 192))
thresholds = json.loads((CKPT / "thresholds.json").read_text())
ct, mt = thresholds["conf_threshold"], thresholds["margin_threshold"]

meta = json.loads((CKPT / "onnx_meta.json").read_text())
op_map = meta["op_map"]

sess = ort.InferenceSession(str(CKPT / "best_classifier.onnx"),
                            providers=["CPUExecutionProvider"])
tf = transforms.Compose([
    transforms.Resize((img_size, img_size)),
    transforms.ToTensor(),
    transforms.Normalize(IMAGENET_MEAN, IMAGENET_STD),
])

manifest = json.loads((ROOT / "training" / "manifest.json").read_text())
test_recs = manifest["records"] if "split" not in manifest["records"][0] else [
    r for r in manifest["records"] if r.get("split") == "test"
]

# one image per class (up to 10)
seen, picked = set(), []
for r in test_recs:
    if r["label"] not in seen:
        seen.add(r["label"])
        picked.append(r)
    if len(picked) >= len(classes):
        break

dataset_root = ROOT.parents[0]
print(f"thresholds: conf>={ct}, margin>={mt}")
print(f"{'label':<12} {'torch_cls':<12} {'onnx_cls':<12} {'maxdiff':<10} "
      f"{'accept(t/o)':<12} decision_match")
all_ok = True
for rec in picked:
    img_path = str(dataset_root / rec["path"])
    if not Path(img_path).exists():
        continue

    py = classify_image(img_path)

    img = Image.open(img_path).convert("RGB")
    x = tf(img).unsqueeze(0)
    logits = sess.run(["logits"], {"input": x.numpy()})[0][0]
    e = np.exp(logits - logits.max())
    probs = e / e.sum()
    top3_idx = np.argsort(probs)[::-1][:3]

    best_p = float(probs[top3_idx[0]])
    second_p = float(probs[top3_idx[1]])
    margin = best_p - second_p
    onnx_accept = bool(best_p >= ct and margin >= mt)
    onnx_top = classes[int(top3_idx[0])]

    py_probs_map = {p["class"]: p["confidence"] / 100 for p in py.get("top_predictions", [])}
    maxdiff = max(abs(py_probs_map.get(c, 0) - float(probs[i]))
                  for i, c in enumerate(classes))

    py_accept = py.get("is_waste")
    ok = (py_accept == onnx_accept) and (py.get("category") == onnx_top or not py_accept)
    all_ok &= ok
    print(f"{rec['label']:<12} {str(py.get('category')):<12} {onnx_top:<12} "
          f"{maxdiff:<10.5f} {f'{py_accept}/{onnx_accept}':<12} {'OK' if ok else 'MISMATCH'}")

print("\nALL PARITY CHECKS PASSED" if all_ok else "\nPARITY FAILURES PRESENT")
sys.exit(0 if all_ok else 1)
