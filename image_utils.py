from PIL import Image, ImageOps
import os

def convert_to_png(input_path):
    """
    Converts an image at input_path to PNG format.
    Returns the path to the new PNG file, or None if conversion failed.
    """
    try:
        # Open the image
        with Image.open(input_path) as img:
            # Apply EXIF rotation if present (fixes orientation issues)
            img = ImageOps.exif_transpose(img)
            
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
