"""
Severity / Priority Scoring using XGBoost.
Falls back to rule-based scoring if model unavailable.
"""
import numpy as np
import os
from config import USE_XGBOOST, SEVERITY_MODEL_PATH

_severity_model = None
SEVERITY_LABELS = ["low", "medium", "high", "critical"]

def _load_xgboost():
    global _severity_model
    if _severity_model is not None:
        return _severity_model
    if not USE_XGBOOST:
        return None
    try:
        import xgboost as xgb
        if not os.path.exists(SEVERITY_MODEL_PATH):
            print(f"[severity] XGBoost model not found at {SEVERITY_MODEL_PATH}")
            return None
        _severity_model = xgb.XGBClassifier()
        _severity_model.load_model(SEVERITY_MODEL_PATH)
        return _severity_model
    except Exception as e:
        print(f"[severity] XGBoost load failed: {e}")
        return None

HAZARDOUS_TYPES = {"hazardous_waste", "e_waste"}
HIGH_RISK_TYPES = {"construction_debris", "drain_blockage"}
VOLUME_WEIGHTS = {"small": 1, "medium": 2, "large": 3, "very_large": 4}

def _rule_based_severity(waste_type: str, volume_category: str, confidence: float,
                          report_frequency: int = 1, age_hours: float = 0,
                          location_sensitivity: float = 0.0) -> dict:
    """Rule-based severity scoring when XGBoost is not available."""
    score = 0.0
    
    if waste_type in HAZARDOUS_TYPES:
        score += 35
    elif waste_type in HIGH_RISK_TYPES:
        score += 25
    else:
        score += 10
    
    score += VOLUME_WEIGHTS.get(volume_category, 2) * 5
    
    score += min(confidence / 100 * 10, 10)
    
    score += min(report_frequency * 3, 15)
    
    if age_hours > 24:
        score += 10
    elif age_hours > 12:
        score += 5
    
    score += location_sensitivity * 15
    
    if score >= 70:
        level = "critical"
    elif score >= 50:
        level = "high"
    elif score >= 30:
        level = "medium"
    else:
        level = "low"
    
    confidence_pct = min(95, max(60, int(score + np.random.randint(-5, 5))))
    
    return {"severity": level, "confidence": confidence_pct, "score": round(score, 1)}

def score_severity(waste_type: str, volume_category: str, confidence: float,
                    report_frequency: int = 1, age_hours: float = 0,
                    location_sensitivity: float = 0.0) -> dict:
    """Returns { severity, confidence, score, method }."""
    model = _load_xgboost()
    
    if model is not None:
        try:
            type_map = {cat: i for i, cat in enumerate(["overflowing_bin", "garbage_dump", "plastic_waste",
                                                         "construction_debris", "organic_waste", "e_waste",
                                                         "hazardous_waste", "drain_blockage", "other"])}
            vol_map = {"small": 0, "medium": 1, "large": 2, "very_large": 3}
            
            features = np.array([[
                type_map.get(waste_type, 8),
                vol_map.get(volume_category, 1),
                location_sensitivity,
                report_frequency,
                age_hours,
            ]])
            
            pred = int(model.predict(features)[0])
            proba = model.predict_proba(features)[0]
            
            return {
                "severity": SEVERITY_LABELS[pred],
                "confidence": int(float(max(proba)) * 100),
                "score": round(float(max(proba)) * 100, 1),
                "method": "xgboost",
            }
        except Exception as e:
            print(f"[severity] XGBoost inference failed: {e}")
    
    result = _rule_based_severity(waste_type, volume_category, confidence,
                                   report_frequency, age_hours, location_sensitivity)
    result["method"] = "rule_based"
    return result
