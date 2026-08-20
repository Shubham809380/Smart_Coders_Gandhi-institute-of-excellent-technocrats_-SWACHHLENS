from .detector import detect_waste
from .volume import estimate_volume
from .duplicate import get_image_embedding, cosine_similarity_check
from .hotspot import cluster_reports
from .severity import score_severity
from .dispatch import recommend_action
