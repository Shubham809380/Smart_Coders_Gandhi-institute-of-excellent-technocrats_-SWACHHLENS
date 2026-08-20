"""
SwachhLens Fine-Tuning Script
=============================
Fine-tunes YOLOv11m on custom waste detection dataset.

Usage:
    # 1. Collect and label data first (see data.yaml for instructions)
    # 2. Run training:
    python training/train.py

    # Or with custom settings:
    python training/train.py --epochs 100 --imgsz 640 --batch 8

Prerequisites:
    pip install ultralytics

After training:
    1. Copy training/runs/detect/train/weights/best.pt → checkpoints/best_waste.pt
    2. Set env: YOLO_MODEL_PATH=checkpoints/best_waste.pt
    3. Restart the AI service
"""
import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Fine-tune YOLOv11 for waste detection")
    parser.add_argument("--epochs", type=int, default=100, help="Training epochs (default: 100)")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size (default: 640)")
    parser.add_argument("--batch", type=int, default=8, help="Batch size (default: 8, lower for low VRAM)")
    parser.add_argument("--model", type=str, default="yolo11m.pt", help="Pretrained model to start from")
    parser.add_argument("--device", type=str, default="", help="Device: '' for auto, 'cpu', '0' for GPU")
    parser.add_argument("--patience", type=int, default=20, help="Early stopping patience (default: 20)")
    args = parser.parse_args()

    training_dir = os.path.join(os.path.dirname(__file__))
    data_yaml = os.path.join(training_dir, "data.yaml")

    if not os.path.exists(data_yaml):
        print(f"ERROR: {data_yaml} not found.")
        print("Create the dataset first: see data.yaml comments for instructions.")
        sys.exit(1)

    # Check for labeled data
    train_imgs = os.path.join(training_dir, "images", "train")
    if not os.path.exists(train_imgs) or len(os.listdir(train_imgs)) == 0:
        print(f"ERROR: No training images found in {train_imgs}")
        print("Add labeled images first. See data.yaml for directory structure.")
        sys.exit(1)

    img_count = len([f for f in os.listdir(train_imgs) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))])
    print(f"Found {img_count} training images")
    print(f"Model: {args.model}")
    print(f"Epochs: {args.epochs}, Batch: {args.batch}, Image size: {args.imgsz}")
    print()

    try:
        from ultralytics import YOLO
    except ImportError:
        print("ERROR: ultralytics not installed. Run: pip install ultralytics")
        sys.exit(1)

    model = YOLO(args.model)
    results = model.train(
        data=data_yaml,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        device=args.device or None,
        project=os.path.join(training_dir, "runs"),
        name="detect",
        exist_ok=True,
        pretrained=True,
        optimizer="auto",
        verbose=True,
        seed=42,
        deterministic=True,
        augment=True,
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,
        translate=0.1,
        scale=0.5,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.1,
    )

    best_weights = os.path.join(training_dir, "runs", "detect", "train", "weights", "best.pt")
    output_dir = os.path.join(os.path.dirname(training_dir), "checkpoints")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "best_waste.pt")

    if os.path.exists(best_weights):
        import shutil
        shutil.copy2(best_weights, output_path)
        print(f"\nBest weights saved to: {output_path}")
        print(f"Set YOLO_MODEL_PATH={output_path} and restart the AI service.")
    else:
        print(f"\nWARNING: Best weights not found at {best_weights}")
        print("Check training/runs/detect/train/ for results.")

    print("\nTraining complete!")

if __name__ == "__main__":
    main()
