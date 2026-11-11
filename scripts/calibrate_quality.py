"""Calibrate quality metrics and verify score equivalence on sample boards."""
import os
import sys
import math
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)

from api.detect import run

FIXTURES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests", "fixtures")
os.makedirs(FIXTURES_DIR, exist_ok=True)

def compute_quality_python(img):
    # Downscale to 256x256 for fast metric extraction
    thumb = img.convert("L").resize((256, 256), Image.Resampling.BILINEAR)
    arr = np.array(thumb, dtype=np.float32)
    
    # 3x3 Laplacian kernel
    lap = (
        np.roll(arr, -1, axis=0) +
        np.roll(arr, 1, axis=0) +
        np.roll(arr, -1, axis=1) +
        np.roll(arr, 1, axis=1) -
        4 * arr
    )[1:-1, 1:-1]
    
    blur_var = float(np.var(lap))
    mean_lum = float(np.mean(arr))
    clipped = float(np.mean((arr < 5) | (arr > 250)))
    
    return {
        "blur_var": round(blur_var, 1),
        "mean_lum": round(mean_lum, 1),
        "clipped_pct": round(clipped * 100, 1)
    }

def main():
    samples_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "samples")
    sample_files = [
        "sample_clean_1.jpg",
        "sample_clean_2.jpg",
        "sample_defect_1.jpg",
        "sample_defect_2.jpg"
    ]
    
    print("=== Quality Metrics Calibration on Sample Boards ===")
    for fname in sample_files:
        path = os.path.join(samples_dir, fname)
        img = Image.open(path)
        stats = compute_quality_python(img)
        print(f"[{fname}] Resolution: {img.size}, Blur Var: {stats['blur_var']}, Mean Lum: {stats['mean_lum']}, Clipped: {stats['clipped_pct']}%")

    # Generate synthetic degraded test fixtures
    base_img = Image.open(os.path.join(samples_dir, "sample_clean_1.jpg"))
    
    # 1. Blurred image (Gaussian blur radius 4)
    blurred_img = base_img.filter(ImageFilter.GaussianBlur(radius=4.5))
    blurred_path = os.path.join(FIXTURES_DIR, "test_blurred.jpg")
    blurred_img.save(blurred_path, "JPEG", quality=85)
    blurred_stats = compute_quality_python(blurred_img)
    print(f"\n[Generated test_blurred.jpg] Blur Var: {blurred_stats['blur_var']} (expected < 45.0)")
    
    # 2. Severely underexposed image (brightness 0.15)
    dark_img = ImageEnhance.Brightness(base_img).enhance(0.15)
    dark_path = os.path.join(FIXTURES_DIR, "test_dark.jpg")
    dark_img.save(dark_path, "JPEG", quality=85)
    dark_stats = compute_quality_python(dark_img)
    print(f"[Generated test_dark.jpg] Mean Lum: {dark_stats['mean_lum']} (expected < 25.0)")

    # Score Equivalence Verification
    print("\n=== Score Equivalence Verification for Upload Fitting (Tolerance <= 0.02) ===")
    tolerance = 0.02
    all_equivalent = True
    
    for fname in sample_files:
        path = os.path.join(samples_dir, fname)
        with open(path, "rb") as f:
            raw_bytes = f.read()
        
        # 1. Raw score
        dets_raw, ms_raw = run(raw_bytes, 0.20)
        peak_raw = max([d["confidence"] for d in dets_raw], default=0.0)
        
        # 2. Fitted score (re-encoded / fitted to 640x640 JPEG 95)
        img = Image.open(path).convert("RGB")
        S = 640
        scale = min(S / img.width, S / img.height)
        w, h = round(img.width * scale), round(img.height * scale)
        padX, padY = (S - w) // 2, (S - h) // 2
        lb = Image.new("RGB", (S, S), (114, 114, 114))
        lb.paste(img.resize((w, h), Image.Resampling.BILINEAR), (padX, padY))
        import io
        buf = io.BytesIO()
        lb.save(buf, format="JPEG", quality=95)
        fitted_bytes = buf.getvalue()
        
        dets_fit, ms_fit = run(fitted_bytes, 0.20)
        peak_fit = max([d["confidence"] for d in dets_fit], default=0.0)
        
        delta = abs(peak_fit - peak_raw)
        passed = delta <= tolerance
        if not passed:
            all_equivalent = False
        print(f"[{fname}] Raw peak: {peak_raw:.4f}, Fitted peak: {peak_fit:.4f}, Delta: {delta:.4f} -> {'PASS' if passed else 'FAIL'}")

    print(f"\nScore Equivalence Verified: {all_equivalent}")

if __name__ == "__main__":
    main()
