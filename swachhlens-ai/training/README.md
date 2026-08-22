# SwachhLens CNN Waste Classifier

Two-stage waste recognition with explicit unknown/non-waste rejection:

```
Citizen Image
     |
Waste Gate (calibrated confidence + margin on trained CNN)
     |-- reject --> UNKNOWN / NOT WASTE  (is_waste=false)
     '-- accept -> Waste Category (10-class unified taxonomy)
                     |
              Volume / Severity / Dispatch pipeline (unchanged)
```

## Why this exists
The old detector mapped generic COCO objects to waste categories, producing
`Person -> Plastic`, `Car -> Trash`, `Tree -> Cardboard`. A closed-set softmax
classifier always picks *some* class; the fix is a calibrated rejection rule:
accept a prediction only when the model is confident AND decisive, else return
UNKNOWN. This does NOT promise perfect unknown detection - it measurably
reduces false accepts (see calibration report).

## Datasets
| Source | Classes | Images | Notes |
|---|---|---|---|
| Garbage Classification 12 | 12 | 15,515 | 400px-ish, heavy `clothes` class |
| RealWaste | 9 | 4,752 | uniform 524x524 real-world photos |

Full scan: `training/dataset_report.json`
- corrupted files: 0
- exact duplicate groups: 18 (19 extra copies removed)
- cross-dataset exact dupes: 0
- near-duplicate clusters (dHash hamming<=6): 323 clusters / 1801 images
- imbalance ratio: ~16.8:1 (`clothes+shoes -> textile` dominates)

## Unified taxonomy (10 classes)
Defined in `training/prepare_dataset.py` with per-mapping rationale and FLAGGED
judgement calls (`shoes->textile`, `Vegetation->organic_waste`). Saved to
`training/class_mapping.json`.

plastic, paper, cardboard, metal, glass, organic, vegetation, textile,
battery, mixed_trash

Operational mapping (backward compatible with the app's existing categories):
plastic->plastic_waste, paper->paper_waste*, cardboard->cardboard_waste*,
metal->metal_waste*, glass->glass_waste*, organic/vegetation->organic_waste,
textile->textile_waste*, battery->hazardous_waste, mixed_trash->garbage_dump.
(* new additive frontend labels; severity/dispatch use safe defaults for them.)

## Splits (no leakage)
- exact dupes dropped, then dHash LSH clustering (hamming<=6)
- whole cluster always lands in ONE split; verified 0 spanning pairs
- stratified 70/15/15 by unified class -> train 14,173 / val 3,040 / test 3,035

## Training
`training/train_classifier.py`

Phase A - architecture selection (frozen backbone + linear probe, identical
protocol for all three candidates):

| Architecture | Val macro-F1 | Latency (CPU) | Params |
|---|---|---|---|
| MobileNetV3-Small | 0.8171 | 19.8 ms | 0.93 M |
| **EfficientNet-B0** | **0.8762** | **26.6 ms** | **4.02 M** |
| ResNet18 | 0.8315 | 27.7 ms | 11.18 M |

Winner: EfficientNet-B0 (best F1 within comparable CPU latency; ResNet18 costs
3x params for worse accuracy).

Phase B - full fine-tune of EfficientNet-B0:
- unfreeze last 3 feature blocks + head
- augmentation: RandomResizedCrop(0.65-1.0), HFlip, rot 15deg,
  brightness/contrast jitter 0.25 - nothing that changes waste identity
- weighted CrossEntropy (inverse-sqrt frequency) for the 16.8:1 imbalance
- AdamW (head 3e-4, tail 5e-5), cosine schedule, weight decay 1e-4
- early stopping on val macro-F1, best checkpoint kept
- seed=42 everywhere; CPU-only friendly (192px input)

## Unknown rejection (calibrated, not hard-coded)
`training/calibrate_threshold.py` sweeps conf thresholds x margin rules on
validation and reports coverage; if negative images are available it also
measures true rejection and picks the operating point maximizing the harmonic
mean of (waste coverage, unknown rejection). Negative sources supported:

1. `dataset/negative/*.jpg` - your own person/car/dog/chair/laptop photos
2. CIFAR-10 test split as proxy negatives (auto-download)

Result saved to `checkpoints/thresholds.json`; the service refuses to guess.

## Final metrics (test split, 3,035 unseen images)

| Metric | Value |
|---|---|
| Accuracy | **90.8%** |
| Macro F1 | **0.886** |
| Best val macro-F1 (checkpoint) | 0.8916 |

Per-class test F1: textile 0.97, battery 0.94, vegetation 0.93, organic 0.95,
glass 0.89, cardboard 0.89, paper 0.88, metal 0.84, plastic 0.79,
mixed_trash 0.79.

Operating point (`checkpoints/thresholds.json`): **conf >= 0.80 AND margin >= 0.10**

| Behaviour | Rate |
|---|---|
| Real waste accepted (coverage) | 80.0% |
| CIFAR-10 proxy negatives rejected | 81.6% |
| Hardest accept classes | plastic 53%, mixed_trash 63%, cardboard 66% |

Tradeoff is deliberate: a false UNKNOWN costs one retake; a false ACCEPT
poisons the reports database (the original Person->Plastic bug). Tune via
`CALIB_COVERAGE_FLOOR` env var when re-running calibration (default 0.80).

Live service verified end-to-end:
- glass bottle -> HTTP 200 `{wasteType: glass_waste, confidence: 96.0}`
- cat photo -> HTTP 400 "No waste detected in image..."

## Inference contract
```
POST swachhlens-ai /api/analyze-waste  returns (new fields additive):
{
  "is_waste": true,
  "category": "plastic",
  "confidence": 93.2,
  "status": "accepted",
  "top_predictions": [{"class":"plastic","confidence":93.2}, ...],
  ...existing fields (wasteType mapped, volume, severity, dispatch)
}
```
Rejected image -> HTTP 400 "No waste detected..." (same UX as before).

CLI demo: `python demo_scenarios.py` or `python inference/predict.py <img>`

## Honest limitations
- No training data for overflowing_bin, construction_debris, drain_blockage,
  illegal dump scenes -> NOT claimed by this classifier (legacy rule paths or
  future custom dataset/detector handle them).
- Laptop/e-waste intentionally NOT a class: without real e-waste training data
  laptops fall below the acceptance bar -> UNKNOWN (correct behaviour).
- Unknown rejection is probabilistic, never perfect; tune `dataset/negative/`
  + recalibrate for production SLAs.
