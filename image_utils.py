from PIL import Image, ImageOps
import os

# Max dimension (width or height) to reduce memory usage on small instances.
# Large images (e.g. 4000x4000) can use 64MB+ in RGBA; 2048 keeps it ~16MB.
MAX_DIMENSION = 2048
# Reject images larger than this (avoids loading huge images into memory at all)
MAX_DIMENSION_REJECT = 8192

def _log(msg):
    print(f"[IMG] {msg}", flush=True)

def convert_to_png(input_path):
    """
    Converts an image at input_path to PNG format.
    Resizes large images to reduce memory usage and avoid OOM on constrained instances.
    Returns the path to the new PNG file, or None if conversion failed.
    """
    file_size_mb = os.path.getsize(input_path) / (1024 * 1024)
    _log(f"convert_to_png start: {input_path} ({file_size_mb:.2f} MB)")

    try:
        # Open the image (does not load full pixel data yet)
        with Image.open(input_path) as img:
            w, h = img.size
            _log(f"opened image: {w}x{h} px, format={img.format}")

            if w > MAX_DIMENSION_REJECT or h > MAX_DIMENSION_REJECT:
                _log(f"REJECT: dimensions {w}x{h} exceed max {MAX_DIMENSION_REJECT}px")
                return None

            # Apply EXIF rotation if present (fixes orientation issues)
            img = ImageOps.exif_transpose(img)
            w, h = img.size
            _log(f"after exif_transpose: {w}x{h} px")

            # Resize if too large to reduce memory (Pillow loads full image into RAM)
            if w > MAX_DIMENSION or h > MAX_DIMENSION:
                ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
                new_size = (int(w * ratio), int(h * ratio))
                _log(f"resizing {w}x{h} -> {new_size[0]}x{new_size[1]} (ratio={ratio:.3f})")
                img = img.resize(new_size, Image.LANCZOS)

            # Convert to RGBA to handle transparency and ensure compatibility
            _log("converting to RGBA")
            img = img.convert('RGBA')

            # Create new filename
            base, _ = os.path.splitext(input_path)
            output_path = base + ".png"

            # Save as PNG
            _log(f"saving to {output_path}")
            img.save(output_path, 'PNG')

            out_size_mb = os.path.getsize(output_path) / (1024 * 1024)
            _log(f"convert_to_png done: {output_path} ({out_size_mb:.2f} MB)")
            return output_path

    except Exception as e:
        _log(f"convert_to_png FAILED: {input_path}: {type(e).__name__}: {e}")
        return None
