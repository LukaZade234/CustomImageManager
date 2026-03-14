from PIL import Image, ImageOps
import os

# Max dimension (width or height) to reduce memory usage on small instances.
# Large images (e.g. 4000x4000) can use 64MB+ in RGBA; 2048 keeps it ~16MB.
MAX_DIMENSION = 2048
# Reject images larger than this (avoids loading huge images into memory at all)
MAX_DIMENSION_REJECT = 8192

def convert_to_png(input_path):
    """
    Converts an image at input_path to PNG format.
    Resizes large images to reduce memory usage and avoid OOM on constrained instances.
    Returns the path to the new PNG file, or None if conversion failed.
    """
    try:
        # Open the image (does not load full pixel data yet)
        with Image.open(input_path) as img:
            w, h = img.size
            if w > MAX_DIMENSION_REJECT or h > MAX_DIMENSION_REJECT:
                print(f"Image too large: {w}x{h} (max {MAX_DIMENSION_REJECT}px)", flush=True)
                return None

            # Apply EXIF rotation if present (fixes orientation issues)
            img = ImageOps.exif_transpose(img)
            w, h = img.size

            # Resize if too large to reduce memory (Pillow loads full image into RAM)
            if w > MAX_DIMENSION or h > MAX_DIMENSION:
                ratio = min(MAX_DIMENSION / w, MAX_DIMENSION / h)
                new_size = (int(w * ratio), int(h * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            # Convert to RGBA to handle transparency and ensure compatibility
            img = img.convert('RGBA')

            # Create new filename
            base, _ = os.path.splitext(input_path)
            output_path = base + ".png"

            # Save as PNG
            img.save(output_path, 'PNG')

            return output_path

    except Exception as e:
        print(f"Error converting image {input_path}: {e}")
        return None
