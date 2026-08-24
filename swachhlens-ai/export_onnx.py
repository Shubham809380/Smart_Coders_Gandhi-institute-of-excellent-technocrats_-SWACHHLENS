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

import numpy as np
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
    multilabel = ckpt.get("loss") == "bce_multilabel"
    model = _build_model(ckpt["arch"], len(ckpt["classes"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    img_size = int(ckpt.get("img_size", 192))
    dummy = torch.randn(1, 3, img_size, img_size)

    out_path = CKPT_DIR / "best_classifier.onnx"
    # dynamo=False -> classic TorchScript exporter, which inlines all weights
    # into the single .onnx file. The new dynamo exporter (torch>=2.10 default)
    # spills ~15MB of weights into best_classifier.onnx.data; the Node backend
    # and Vercel bundle only the .onnx itself, so that layout breaks prod.
    torch.onnx.export(
        model,
        dummy,
        str(out_path),
        input_names=["input"],
        output_names=["logits"],
        dynamic_axes={"input": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
        dynamo=False,
    )
    print(f"Exported -> {out_path} ({out_path.stat().st_size / 1024 / 1024:.1f} MB)")

    mapping_path = ROOT / "training" / "class_mapping.json"
    op_map = json.loads(mapping_path.read_text()).get("operational_category_map", {})

    # parity check: PyTorch vs ONNX across N real images (waste AND negatives)
    # so batch-dynamic axes and both label regimes are exercised, not one dummy.
    n_parity = 12
    samples = _parity_samples(img_size, ckpt.get("classes", []), multilabel, n_parity)
    try:
        import onnxruntime as ort
        sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        worst = 0.0
        with torch.inference_mode():
            for i, x in enumerate(samples):
                ref_logits = model(x)[0]
                ref = torch.sigmoid(ref_logits) if multilabel else torch.softmax(ref_logits, dim=0)
                onnx_logits = sess.run(["logits"], {"input": x.numpy()})[0][0]
                got = 1 / (1 + np.exp(-onnx_logits)) if multilabel else np_softmax(onnx_logits)
                diff = float(np.abs(np.asarray(ref) - np.asarray(got)).max())
                worst = max(worst, diff)
        print(f"parity over {len(samples)} images: max |torch-onnx| diff = {worst:.6f}")
        assert worst < 1e-4, "ONNX export parity check FAILED"
        print("Parity OK")
    except ImportError:
        print("onnxruntime not installed locally; skipping runtime parity check "
              "(Node-side verify_parities.js will cover it).")

    meta = {
        "arch": ckpt["arch"],
        "img_size": img_size,
        "classes": ckpt["classes"],
        "loss": ckpt.get("loss", "ce_softmax"),
        "op_map": op_map,
        "val_macro_f1": ckpt.get("metrics", {}).get("val_macro_f1"),
    }
    meta_path = CKPT_DIR / "onnx_meta.json"
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"Meta -> {meta_path}")


def _parity_samples(img_size: int, classes: list[str], multilabel: bool, n: int):
    """Pull a deterministic mix of real waste val images and non-waste negatives."""
    from PIL import Image
    import numpy as np
    from torchvision import transforms as T

    tf = T.Compose([T.Resize((img_size, img_size)), T.ToTensor(),
                    T.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])])
    paths = []
    manifest_path = ROOT / "training" / "manifest.json"
    if manifest_path.exists():
        recs = json.loads(manifest_path.read_text())["records"]
        val = [r for r in recs if r["split"] == "val"]
        paths += [(ROOT / ".." / r["path"]).resolve() for r in val[: n // 2]]
    nw_path = ROOT / "training" / "nonwaste_manifest.json"
    if nw_path.exists():
        nw = json.loads(nw_path.read_text())
        for r in nw[:: max(1, len(nw) // max(1, n - len(paths)))][: n - len(paths)]:
            paths.append((ROOT / "training" / r["path"]).resolve())
    xs = []
    for p in paths[:n]:
        if p.exists():
            xs.append(tf(Image.open(p).convert("RGB")))
    while len(xs) < 2:
        xs.append(torch.randn(1, 3, img_size, img_size))
    return xs


def np_softmax(x):
    import numpy as np
    e = np.exp(x - np.max(x))
    return e / e.sum()


if __name__ == "__main__":
    main()
