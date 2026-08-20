"""
Duplicate Detection using CLIP embeddings.
Falls back to perceptual hashing if CLIP unavailable.
"""
import numpy as np
import os
from config import USE_CLIP, CLIP_MODEL

_clip_model = None
_clip_processor = None

def _load_clip():
    global _clip_model, _clip_processor
    if _clip_model is not None:
        return _clip_model, _clip_processor
    if not USE_CLIP:
        return None, None
    try:
        from transformers import CLIPProcessor, CLIPModel
        _clip_model = CLIPModel.from_pretrained(CLIP_MODEL)
        _clip_processor = CLIPProcessor.from_pretrained(CLIP_MODEL)
        return _clip_model, _clip_processor
    except Exception as e:
        print(f"[duplicate] CLIP load failed: {e}")
        return None, None

def get_image_embedding(image_path: str) -> np.ndarray:
    """Get 512-d CLIP embedding for an image."""
    model, processor = _load_clip()
    
    if model is not None and processor is not None:
        try:
            from PIL import Image
            image = Image.open(image_path).convert("RGB")
            inputs = processor(images=image, return_tensors="pt")
            import torch
            with torch.no_grad():
                embedding = model.get_image_features(**inputs)
            return embedding[0].numpy()
        except Exception as e:
            print(f"[duplicate] CLIP embedding failed: {e}")
    
    # Fallback: perceptual hash-based embedding
    return _phash_embedding(image_path)

def _phash_embedding(image_path: str) -> np.ndarray:
    """Simple perceptual hash as fallback embedding."""
    try:
        import cv2
        img = cv2.imread(image_path)
        if img is None:
            return np.random.rand(512).astype(np.float32)
        small = cv2.resize(img, (32, 32))
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        dct = cv2.dct(gray.astype(np.float32))
        dctlowfreq = dct[:8, :8]
        med = np.median(dctlowfreq)
        bits = (dctlowfreq > med).flatten().astype(np.float32)
        if len(bits) < 512:
            bits = np.pad(bits, (0, 512 - len(bits)))
        return bits[:512]
    except Exception:
        return np.random.rand(512).astype(np.float32)

def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))

def cosine_similarity_check(emb_a: np.ndarray, emb_b: np.ndarray) -> dict:
    sim = cosine_similarity(emb_a, emb_b)
    return {
        "similarity": round(sim, 4),
        "is_duplicate": sim > 0.85,
        "confidence": "high" if sim > 0.9 else "medium" if sim > 0.85 else "low",
    }
