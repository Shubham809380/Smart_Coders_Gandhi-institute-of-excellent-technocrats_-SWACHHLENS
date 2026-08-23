"""
Export the trained EfficientNet-B0 waste classifier to ONNX for the Node/Vercel
inference path (backend/ai/onnxProvider.js).

Output:
  checkpoints/best_classifier.onnx          (fixed input 1x3x192x192)
  checkpoints/onnx_meta.json                {classes, img_size, op_map}

Usage:
  python export_onnx.py
"""
from __future__ import annotations

import json
from pathlib import Path

import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parent
CKPT_DIR = ROOT / "checkpoints"


def _build_model(arch: str, num_classes: int):
    from training.train_classifier import make_model
    seq, feat_dim = make_model(arch, num_classes)
    head = nn.Sequential(nn.Dropout(0.2), nn.Linear(feat_dim, num_classes))
    return nn.Sequential(seq, head)


def main() -> None:
    ckpt = torch.load(CKPT_DIR / "best_classifier.pth", map_location="cpu",
                      weights_only=False)
    model = _build_model(ckpt["arch"], len(ckpt["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    img_size = int(ckpt.get("img_size", 192))
    dummy = torch.randn(1, 3, img_size, img_size)

    out_path = CKPT_DIR / "best_classifier.onnx"
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"Exported -> {out_path} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")

    mapping_path = ROOT / "training" / "class_mapping.json"
    op_map = json.loads(mapping_path.read_text()).get("operational_category_map", {})

    # quick parity check: PyTorch vs ONNX (onnxruntime if available)
    with torch.inference_mode():
        ref = torch.softmax(model(dummy), dim=1)[0]
    print("torch probs:", [round(float(p), 4) for p in ref])

    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        logits = sess.run(["logits"], {"input": dummy.numpy()})[0]
        ex = np_softmax(logits[0])
        diff = max(abs(float(a - b)) for a, b in zip(ref.tolist(), ex))
        print("onnx  probs:", [round(float(p), 4) for p in ex])
        print(f"max |torch-onnx| prob diff: {diff:.6f}")
        assert diff < 1e-4, "ONNX export parity check FAILED"
        print("Parity OK")
    except ImportError:
        print("onnxruntime not installed locally; skipping runtime parity check "
              "(Node-side verify_parities.js will cover it).")

    meta = {
        "arch": ckpt["arch"],
        "img_size": img_size,
        "classes": ckpt["classes"],
        "op_map": op_map,
        "val_macro_f1": ckpt.get("metrics", {}).get("val_macro_f1"),
    }
    meta_path = CKPT_DIR / "onnx_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Meta -> {meta_path}")


def np_softmax(x):
    import numpy as np
    e = np.exp(x - np.max(x))
    return e / e.sum()


if __name__ == "__main__":
    main()
