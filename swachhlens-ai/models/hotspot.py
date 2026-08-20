"""
Hotspot Clustering using DBSCAN.
Pure scikit-learn, no GPU needed.
"""
import numpy as np
from sklearn.cluster import DBSCAN
from config import CLUSTER_EPS_METERS, CLUSTER_MIN_SAMPLES

def cluster_reports(coords: list, eps_meters: float = None, min_samples: int = None):
    """
    Cluster report coordinates using DBSCAN with haversine metric.
    coords: list of (latitude, longitude) tuples
    Returns: dict with cluster_id -> { center_lat, center_lng, count, report_indices }
    """
    if eps_meters is None:
        eps_meters = CLUSTER_EPS_METERS
    if min_samples is None:
        min_samples = CLUSTER_MIN_SAMPLES
    
    if len(coords) < min_samples:
        return {"clusters": [], "labels": [-1] * len(coords), "noise_count": len(coords)}
    
    coords_arr = np.array(coords, dtype=np.float64)
    coords_rad = np.radians(coords_arr)
    
    kms_per_radian = 6371.0088
    epsilon = (eps_meters / 1000) / kms_per_radian
    
    db = DBSCAN(
        eps=epsilon,
        min_samples=min_samples,
        algorithm="ball_tree",
        metric="haversine",
    )
    labels = db.fit_predict(coords_rad)
    
    clusters = []
    unique_labels = set(labels)
    unique_labels.discard(-1)
    
    for label in sorted(unique_labels):
        mask = labels == label
        cluster_coords = coords_arr[mask]
        center = cluster_coords.mean(axis=0)
        clusters.append({
            "cluster_id": int(label),
            "center_lat": float(center[0]),
            "center_lng": float(center[1]),
            "count": int(mask.sum()),
            "report_indices": np.where(mask)[0].tolist(),
        })
    
    clusters.sort(key=lambda c: c["count"], reverse=True)
    
    return {
        "clusters": clusters,
        "labels": labels.tolist(),
        "noise_count": int((labels == -1).sum()),
        "total_clusters": len(clusters),
    }
