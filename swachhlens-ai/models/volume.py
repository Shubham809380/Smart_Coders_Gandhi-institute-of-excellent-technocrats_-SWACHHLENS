"""
Volume Estimation using SAM (Segment Anything) + Depth Anything V2.
Falls back to contour-based heuristic if models unavailable.
"""
import numpy as np
import cv2
import os
from config import USE_SAM, USE_DEPTH, SAM_CHECKPOINT, DEPTH_MODEL, DEVICE

_sam_predictor = None
_depth_pipe = None

def _load_sam():
    global _sam_predictor
    if _sam_predictor is not None:
        return _sam_predictor
    if not USE_SAM:
        return None
    try:
        from segment_anything import sam_model_registry, SamPredictor
        if not os.path.exists(SAM_CHECKPOINT):
            print(f"[volume] SAM checkpoint not found at {SAM_CHECKPOINT}")
            return None
        sam = sam_model_registry["vit_b"](checkpoint=SAM_CHECKPOINT)
        sam.to(DEVICE)
        _sam_predictor = SamPredictor(sam)
        return _sam_predictor
    except Exception as e:
        print(f"[volume] SAM load failed: {e}")
        return None

def _load_depth():
    global _depth_pipe
    if _depth_pipe is not None:
        return _depth_pipe
    if not USE_DEPTH:
        return None
    try:
        from transformers import pipeline
        _depth_pipe = pipeline(task="depth-estimation", model=DEPTH_MODEL, device=0 if DEVICE == "cuda" else -1)
        return _depth_pipe
    except Exception as e:
        print(f"[volume] Depth model load failed: {e}")
        return None

def _heuristic_volume(image_path: str, bbox: list):
    """Contour-area based volume estimation fallback."""
    img = cv2.imread(image_path)
    if img is None:
        return "medium", 5000.0
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    x1, y1, x2, y2 = [int(c) for c in bbox]
    roi_area = max(1, (x2 - x1) * (y2 - y1))
    
    waste_area = sum(cv2.contourArea(c) for c in contours if cv2.boundingRect(c)[0] >= x1 and cv2.boundingRect(c)[1] >= y1)
    coverage = waste_area / roi_area if roi_area > 0 else 0
    
    volume_score = coverage * 10000
    
    if volume_score < 2000:
        category = "small"
    elif volume_score < 8000:
        category = "medium"
    elif volume_score < 25000:
        category = "large"
    else:
        category = "very_large"
    
    return category, float(volume_score)

def estimate_volume(image_path: str, bbox: list):
    """Returns (volume_category, volume_score)."""
    sam = _load_sam()
    depth = _load_depth()
    
    if sam is not None:
        try:
            import torch
            image = cv2.imread(image_path)
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            sam.set_image(image_rgb)
            
            box = np.array(bbox)
            masks, scores, _ = sam.predict(box=box, multimask_output=False)
            mask = masks[0]
            pixel_area = int(mask.sum())
            
            avg_depth = 128.0
            if depth is not None:
                try:
                    from PIL import Image
                    pil_img = Image.open(image_path).convert("RGB")
                    depth_result = depth(pil_img)
                    depth_map = np.array(depth_result["depth"])
                    avg_depth = float(depth_map[mask].mean()) if mask.any() else float(depth_map.mean())
                except Exception:
                    pass
            
            volume_score = pixel_area * (1.0 / (avg_depth + 1e-5))
            
            if volume_score < 5000:
                category = "small"
            elif volume_score < 20000:
                category = "medium"
            elif volume_score < 50000:
                category = "large"
            else:
                category = "very_large"
            
            return category, float(volume_score)
        except Exception as e:
            print(f"[volume] SAM/Depth inference failed: {e}")
    
    return _heuristic_volume(image_path, bbox)

def get_volume_range(category: str) -> str:
    ranges = {
        "small": "0.1 - 0.5 cubic meters",
        "medium": "0.5 - 1.5 cubic meters",
        "large": "1.5 - 3.0 cubic meters",
        "very_large": "3.0+ cubic meters",
    }
    return ranges.get(category, "0.5 - 1.5 cubic meters")
