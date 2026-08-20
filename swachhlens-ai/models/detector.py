"""
Waste Detection + Classification using YOLOv11.
Falls back to OpenCV-based heuristic detection if YOLO unavailable.
"""
import numpy as np
import cv2
import os
from config import USE_YOLO, YOLO_MODEL_PATH, YOLO_ONNX_PATH, WASTE_CATEGORIES

_yolo_model = None

def _load_yolo():
    global _yolo_model
    if _yolo_model is not None:
        return _yolo_model
    if not USE_YOLO:
        return None
    try:
        from ultralytics import YOLO
        if os.path.exists(YOLO_ONNX_PATH):
            _yolo_model = YOLO(YOLO_ONNX_PATH)
        elif os.path.exists(YOLO_MODEL_PATH):
            _yolo_model = YOLO(YOLO_MODEL_PATH)
        else:
            _yolo_model = YOLO("yolo11m.pt")
        return _yolo_model
    except Exception as e:
        print(f"[detector] YOLO load failed, using fallback: {e}")
        return None

CATEGORY_MAP = {
    # === PLASTIC ===
    "bottle": "plastic_waste", "plastic": "plastic_waste", "cup": "plastic_waste",
    "bag": "plastic_waste", "wrapper": "plastic_waste", "wine glass": "plastic_waste",
    "fork": "plastic_waste", "knife": "plastic_waste", "spoon": "plastic_waste",
    "bowl": "plastic_waste",
    # === ORGANIC / FOOD ===
    "banana": "organic_waste", "apple": "organic_waste", "food": "organic_waste",
    "pizza": "organic_waste", "sandwich": "organic_waste", "orange": "organic_waste",
    "broccoli": "organic_waste", "carrot": "organic_waste", "hot dog": "organic_waste",
    "cake": "organic_waste", "donut": "organic_waste",
    "potted plant": "organic_waste",
    # === E-WASTE ===
    "tv": "e_waste", "monitor": "e_waste", "laptop": "e_waste", "cell phone": "e_waste",
    "keyboard": "e_waste", "mouse": "e_waste", "remote": "e_waste",
    "microwave": "e_waste", "oven": "e_waste", "toaster": "e_waste",
    "refrigerator": "e_waste",
    # === CONSTRUCTION / HEAVY ===
    "construction": "construction_debris", "brick": "construction_debris",
    "concrete": "construction_debris", "wood": "construction_debris",
    "bench": "construction_debris",
    # === GARBAGE / CONTAINERS ===
    "bin": "overflowing_bin", "trash can": "overflowing_bin",
    "suitcase": "garbage_dump", "backpack": "garbage_dump",
    "handbag": "garbage_dump", "tie": "garbage_dump",
    "umbrella": "garbage_dump",
    # === FILTERED OUT (not waste) ===
    "person": None, "car": None, "truck": None, "bus": None,
    "train": None, "boat": None, "airplane": None,
    "bicycle": None, "motorcycle": None,
    "bird": None, "cat": None, "dog": None, "horse": None, "sheep": None, "cow": None,
    "chair": None, "dining table": None, "couch": None, "bed": None,
    "toilet": None, "sink": None, "bird": None,
    "teddy bear": None, "hair drier": None, "toothbrush": None,
}

# COCO class names not in CATEGORY_MAP → treat as generic garbage.
# TODO: Replace this entire CATEGORY_MAP approach once a fine-tuned waste model is trained.
# See data.yaml and training instructions at the bottom of this file.

def _heuristic_detect(image_path: str):
    """OpenCV-based fallback: detect colored waste regions."""
    img = cv2.imread(image_path)
    if img is None:
        return None, []
    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    green_mask = cv2.inRange(hsv, np.array([30, 30, 30]), np.array([85, 255, 255]))
    green_area = np.sum(green_mask > 0) / (h * w)
    
    brown_mask = cv2.inRange(hsv, np.array([10, 30, 30]), np.array([25, 200, 200]))
    brown_area = np.sum(brown_mask > 0) / (h * w)
    
    white_mask = cv2.inRange(hsv, np.array([0, 0, 180]), np.array([180, 30, 255]))
    white_area = np.sum(white_mask > 0) / (h * w)
    
    contours, _ = cv2.findContours(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    large_contours = [c for c in contours if cv2.contourArea(c) > (h * w * 0.01)]
    
    if green_area > 0.15:
        return {"class": "organic_waste", "confidence": 0.72, "bbox": [0, 0, w, h]}, []
    elif brown_area > 0.1:
        return {"class": "construction_debris", "confidence": 0.68, "bbox": [0, 0, w, h]}, []
    elif white_area > 0.08 and len(large_contours) > 2:
        return {"class": "plastic_waste", "confidence": 0.65, "bbox": [0, 0, w, h]}, []
    else:
        return {"class": "garbage_dump", "confidence": 0.60, "bbox": [0, 0, w, h]}, []

def detect_waste(image_path: str):
    """Returns (top_detection, all_detections)."""
    model = _load_yolo()
    
    if model is not None:
        try:
            results = model(image_path, conf=0.25, verbose=False)[0]
            detections = []
            for box in results.boxes:
                cls_name = results.names[int(box.cls)]
                mapped = CATEGORY_MAP.get(cls_name.lower(), cls_name)
                if mapped is None:
                    continue
                # If mapped == cls_name (not in map), treat as generic garbage
                # TEMPORARY: Once fine-tuned model is trained, this won't be needed.
                if mapped == cls_name:
                    mapped = "garbage_dump"
                    print(f"[detector] Unmapped COCO class '{cls_name}' → garbage_dump")
                detections.append({
                    "class": mapped,
                    "confidence": float(box.conf),
                    "bbox": box.xyxy.tolist()[0],
                })
            if detections:
                top = max(detections, key=lambda d: d["confidence"])
                return top, detections
        except Exception as e:
            print(f"[detector] YOLO inference failed: {e}")
    
    return _heuristic_detect(image_path)
