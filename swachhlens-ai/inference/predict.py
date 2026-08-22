"""
SwachhLens - Standalone classifier CLI.

Usage:
  python inference/predict.py <image> [image2 ...]
  python inference/predict.py --json <image>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from models.classifier import classify_image  # noqa: E402


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--json"]
    as_json = "--json" in sys.argv
    if not args:
        print(__doc__)
        sys.exit(1)

    results = []
    for p in args:
        path = Path(p)
        if not path.exists():
            print(f"NOT FOUND: {p}")
            continue
        res = classify_image(str(path))
        results.append({"image": str(path), **res})
        if as_json:
            continue
        if not res.get("checked"):
            print(f"{path.name:<28} classifier unavailable")
            continue
        verdict = "ACCEPTED WASTE" if res["is_waste"] else "UNKNOWN / NOT WASTE"
        top = ", ".join(f"{t['class']} {t['confidence']:.0f}%" for t in res["top_predictions"])
        print(f"{path.name:<28} {res['category']:<12} conf={res['confidence']:>5}% "
              f"-> {verdict}\n{'':<28} top: {top}")

    if as_json:
        print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
