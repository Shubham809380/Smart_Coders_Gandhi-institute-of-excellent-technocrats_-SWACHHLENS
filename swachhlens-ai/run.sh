#!/bin/bash
echo "Starting SwachhLens AI Backend..."
echo "Models: YOLO=${USE_YOLO:-true} SAM=${USE_SAM:-true} DEPTH=${USE_DEPTH:-true} CLIP=${USE_CLIP:-true} XGBOOST=${USE_XGBOOST:-true}"

python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
