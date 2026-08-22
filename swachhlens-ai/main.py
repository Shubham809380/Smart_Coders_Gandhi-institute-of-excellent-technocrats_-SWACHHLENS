"""
SwachhLens AI Backend - FastAPI
Single endpoint: POST /api/analyze-waste
Runs all 6 models in sequence and returns one JSON response.
"""
import os
import sys
import time
import shutil
import tempfile
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models.detector import detect_waste
from models.classifier import classify_image, classifier_status
from models.volume import estimate_volume, get_volume_range
from models.duplicate import get_image_embedding, cosine_similarity_check
from models.hotspot import cluster_reports
from models.severity import score_severity
from models.dispatch import recommend_action
from config import (
    AI_SERVICE_URL, NODE_BACKEND_URL, DUP_DISTANCE_METERS,
    DUP_TIME_WINDOW_HOURS, DUP_SIMILARITY_THRESHOLD, WASTE_CATEGORIES,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("swachhlens-ai")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("SwachhLens AI backend starting...")
    logger.info(f"Device: {os.getenv('DEVICE', 'cpu')}")

    # Eagerly load all models at startup so the first request is fast.
    t_start = time.time()

    logger.info("Loading YOLO detector...")
    from models.detector import _load_yolo
    yolo = _load_yolo()
    logger.info(f"YOLO: {'loaded' if yolo is not None else 'fallback to OpenCV heuristic'}")

    logger.info("Loading SAM segmentor...")
    from models.volume import _load_sam, _load_depth
    sam = _load_sam()
    logger.info(f"SAM: {'loaded' if sam is not None else 'fallback to contour heuristic'}")

    logger.info("Loading Depth Anything V2...")
    depth = _load_depth()
    logger.info(f"Depth: {'loaded' if depth is not None else 'fallback to contour heuristic'}")

    logger.info("Loading CLIP embedder...")
    from models.duplicate import _load_clip
    clip = _load_clip()
    logger.info(f"CLIP: {'loaded' if clip[0] is not None else 'fallback to phash'}")

    logger.info("Loading XGBoost severity model...")
    from models.severity import _load_xgboost
    xgb = _load_xgboost()
    logger.info(f"XGBoost: {'loaded' if xgb is not None else 'fallback to rule-based'}")

    load_time = time.time() - t_start
    logger.info(f"All models loaded in {load_time:.1f}s")
    logger.info("SwachhLens AI backend ready.")
    yield
    logger.info("SwachhLens AI backend shutting down.")

app = FastAPI(
    title="SwachhLens AI",
    version="1.0.0",
    description="AI-powered waste analysis pipeline",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VOLUME_RANGES = {
    "small": "0.1 - 0.5 cubic meters",
    "medium": "0.5 - 1.5 cubic meters",
    "large": "1.5 - 3.0 cubic meters",
    "very_large": "3.0+ cubic meters",
}

RISK_MAP = {
    "hazardous_waste": "Hazardous material, Public health exposure, Environmental contamination",
    "drain_blockage": "Drain blockage, Flooding risk, Mosquito breeding",
    "e_waste": "Electronic waste toxins, Heavy metal leaching",
    "construction_debris": "Structural hazard, Pedestrian obstruction",
    "organic_waste": "Odor, Pest attraction, Area hygiene deterioration",
    "plastic_waste": "Pedestrian obstruction, Environmental pollution, Microplastic risk",
    "overflowing_bin": "Area hygiene deterioration, Pest attraction",
    "garbage_dump": "Area hygiene deterioration, Public health risk",
}

def generate_recommendation(waste_type: str, severity: str, dispatch: dict) -> str:
    team = dispatch.get("team", "cleanup team")
    sla = dispatch.get("sla_hours", 24)
    return f"Assign {team} within {sla} hours. {dispatch.get('instructions', '')}"

@app.get("/health")
async def health():
    return {"status": "ok", "service": "swachhlens-ai", "version": "1.0.0"}

@app.post("/api/analyze-waste")
async def analyze_waste(
    file: UploadFile = File(...),
    latitude: float = Form(0.0),
    longitude: float = Form(0.0),
    comment: str = Form(""),
    mediaType: str = Form("image"),
):
    start_time = time.time()
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or "upload.jpg")[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        temp_path = tmp.name
    
    try:
        # 0. WASTE GATE + CLASSIFICATION (trained CNN with unknown rejection).
        #    Replaces the old "COCO object -> waste category" guessing that
        #    produced Person->Plastic style mistakes. YOLO is still used below
        #    only for the bounding box that volume estimation needs.
        t0 = time.time()
        cls = classify_image(temp_path)
        t_classify = time.time() - t0

        if cls.get("checked") and not cls["is_waste"]:
            reason = cls.get("rejection_reason") or "low_confidence"
            logger.info(f"Rejected as non-waste ({reason}, top={cls['top_predictions'][0]}) in {t_classify:.2f}s")
            raise HTTPException(
                status_code=400,
                detail="No waste detected in image. Please upload a photo of actual garbage/waste.",
            )

        # 1. DETECT (bbox for volume; label comes from the CNN above)
        t0 = time.time()
        top_detection, all_detections = detect_waste(temp_path)
        t_detect = time.time() - t0

        if cls.get("checked"):
            waste_type = cls["wasteType"]                 # operational category
            category = cls["category"]                    # granular CNN class
            confidence = cls["confidence"] / 100.0
            top_predictions = cls["top_predictions"]
        else:
            # fail-open legacy path: no trained checkpoint available
            if not top_detection:
                raise HTTPException(status_code=400, detail="No waste detected in image. Please try a clearer photo.")
            waste_type = top_detection["class"]
            category = waste_type
            confidence = top_detection["confidence"]
            top_predictions = [{"class": waste_type, "confidence": round(confidence * 100, 1)}]

        bbox = top_detection["bbox"] if top_detection else None
        if bbox is None:
            # CNN accepted but YOLO found no box -> full-image box keeps the
            # volume estimator working (it requires x1,y1,x2,y2).
            from PIL import Image as _Img
            with _Img.open(temp_path) as _im:
                _w, _h = _im.size
            bbox = [0, 0, _w, _h]
        detector_method = "yolo" if os.getenv("USE_YOLO", "true") == "true" else "opencv_heuristic"
        needs_review = confidence < 0.30 or detector_method == "opencv_heuristic"
        if needs_review:
            logger.warning(f"Low confidence detection ({confidence:.1%}), flagging for review")
        logger.info(f"Classified: {category} ({confidence:.1%}) in {t_classify:.2f}s; "
                    f"detect {t_detect:.2f}s [{len(all_detections)} boxes]")
        
        # 2. VOLUME ESTIMATION (SAM + Depth / contour fallback)
        t0 = time.time()
        volume_category, volume_score = estimate_volume(temp_path, bbox)
        t_volume = time.time() - t0
        volume_range = VOLUME_RANGES.get(volume_category, "0.5 - 1.5 cubic meters")
        logger.info(f"Volume: {volume_category} (score={volume_score:.0f}) in {t_volume:.2f}s")
        
        # 3. DUPLICATE CHECK (CLIP / phash fallback)
        t0 = time.time()
        embedding = get_image_embedding(temp_path)
        t_embed = time.time() - t0
        logger.info(f"Embedding computed in {t_embed:.2f}s (dim={len(embedding)})")
        
        # 4. SEVERITY SCORING (XGBoost / rule-based)
        t0 = time.time()
        severity_result = score_severity(
            waste_type=waste_type,
            volume_category=volume_category,
            confidence=confidence * 100,
            report_frequency=1,
            age_hours=0,
            location_sensitivity=0.3,
        )
        t_severity = time.time() - t0
        severity = severity_result["severity"]
        severity_confidence = severity_result["confidence"]
        logger.info(f"Severity: {severity} ({severity_confidence}%) via {severity_result['method']} in {t_severity:.2f}s")
        
        # 5. DISPATCH RECOMMENDATION
        dispatch = recommend_action(waste_type, volume_category, severity)
        
        # 6. RISK ASSESSMENT
        potential_risks = RISK_MAP.get(waste_type, "Area hygiene deterioration")
        
        total_time = time.time() - start_time
        
        response = {
            "wasteType": waste_type,
            # --- new CNN classification contract (additive, backward compatible)
            "is_waste": True,
            "category": category,
            "confidence": round(confidence * 100, 1),
            "status": "accepted",
            "top_predictions": top_predictions,
            # ---------------------------------------------------------------
            "estimatedVolume": volume_category,
            "estimatedVolumeRange": volume_range,
            "volumeScore": round(volume_score, 1),
            "severity": severity,
            "severityConfidence": severity_confidence,
            "severityMethod": severity_result["method"],
            "potentialRisk": potential_risks,
            "recommendation": generate_recommendation(waste_type, severity, dispatch),
            "dispatch": dispatch,
            "needsReview": needs_review,
            "detectionSummary": {
                "count": len(all_detections),
                "classes": sorted({d["class"] for d in all_detections} | {category}),
                "topConfidence": round(confidence * 100, 1),
                "coveragePercent": round(min(100, len(all_detections) * 15), 1),
                "recyclableHeavy": waste_type == "plastic_waste",
            },
            "aiVerified": True,
            "processingTime": round(total_time, 2),
            "models": {
                "detector": detector_method,
                "classifier": bool(cls.get("checked")),
                "volume": "sam_depth" if os.getenv("USE_SAM", "true") == "true" else "contour_heuristic",
                "duplicate": "clip" if os.getenv("USE_CLIP", "true") == "true" else "phash",
                "severity": severity_result["method"],
                "dispatch": "rules",
            },
        }
        
        logger.info(f"Analysis complete in {total_time:.2f}s: {waste_type}/{severity}")
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

@app.post("/api/duplicates/check")
async def check_duplicate(
    file: UploadFile = File(...),
    latitude: float = Form(0.0),
    longitude: float = Form(0.0),
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename or "upload.jpg")[1]) as tmp:
        shutil.copyfileobj(file.file, tmp)
        temp_path = tmp.name
    
    try:
        embedding = get_image_embedding(temp_path)
        return {
            "embedding": embedding.tolist(),
            "dimension": len(embedding),
            "message": "Embedding computed. Compare with existing report embeddings in your database.",
        }
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass

@app.post("/api/hotspots")
async def get_hotspots(
    coordinates: str = Form("[]"),
):
    import json
    try:
        coords = json.loads(coordinates)
    except json.JSONDecodeError:
        coords = []
    
    result = cluster_reports(coords)
    return result

@app.get("/api/models/status")
async def model_status():
    from config import USE_YOLO, USE_SAM, USE_DEPTH, USE_CLIP, USE_XGBOOST
    return {
        "classifier": classifier_status(),
        "yolo": {"enabled": USE_YOLO, "status": "loaded" if USE_YOLO else "disabled"},
        "sam": {"enabled": USE_SAM, "status": "loaded" if USE_SAM else "disabled"},
        "depth_anything": {"enabled": USE_DEPTH, "status": "loaded" if USE_DEPTH else "disabled"},
        "clip": {"enabled": USE_CLIP, "status": "loaded" if USE_CLIP else "disabled"},
        "xgboost": {"enabled": USE_XGBOOST, "status": "loaded" if USE_XGBOOST else "disabled"},
        "dbscan": {"enabled": True, "status": "always_available"},
        "dispatch_rules": {"enabled": True, "status": "always_available"},
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
