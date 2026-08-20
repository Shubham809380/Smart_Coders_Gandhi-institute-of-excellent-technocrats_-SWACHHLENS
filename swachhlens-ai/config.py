import os

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000")
NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3000")

# Model paths
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "checkpoints/yolo11m.pt")
YOLO_ONNX_PATH = os.getenv("YOLO_ONNX_PATH", "checkpoints/best.onnx")
SAM_CHECKPOINT = os.getenv("SAM_CHECKPOINT", "checkpoints/sam_vit_b_01ec64.pth")
DEPTH_MODEL = os.getenv("DEPTH_MODEL", "checkpoints/depth_anything_v2")
CLIP_MODEL = os.getenv("CLIP_MODEL", "checkpoints/clip-vit-base-patch32")
SEVERITY_MODEL_PATH = os.getenv("SEVERITY_MODEL_PATH", "checkpoints/severity_model.json")

# Feature flags - set to false to use fallback/heuristic
USE_YOLO = os.getenv("USE_YOLO", "true").lower() == "true"
USE_SAM = os.getenv("USE_SAM", "true").lower() == "true"
USE_DEPTH = os.getenv("USE_DEPTH", "true").lower() == "true"
USE_CLIP = os.getenv("USE_CLIP", "true").lower() == "true"
USE_XGBOOST = os.getenv("USE_XGBOOST", "true").lower() == "true"

# Duplicate detection thresholds
DUP_DISTANCE_METERS = float(os.getenv("DUP_DISTANCE_METERS", "50"))
DUP_TIME_WINDOW_HOURS = float(os.getenv("DUP_TIME_WINDOW_HOURS", "24"))
DUP_SIMILARITY_THRESHOLD = float(os.getenv("DUP_SIMILARITY_THRESHOLD", "0.85"))

# DBSCAN
CLUSTER_EPS_METERS = float(os.getenv("CLUSTER_EPS_METERS", "50"))
CLUSTER_MIN_SAMPLES = int(os.getenv("CLUSTER_MIN_SAMPLES", "3"))

# GPU
DEVICE = os.getenv("DEVICE", "cuda" if os.getenv("USE_CUDA", "false").lower() == "true" else "cpu")

# Waste categories
WASTE_CATEGORIES = [
    "overflowing_bin", "garbage_dump", "plastic_waste", "construction_debris",
    "organic_waste", "e_waste", "hazardous_waste", "drain_blockage"
]
