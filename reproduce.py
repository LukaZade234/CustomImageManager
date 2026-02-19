import os
import sys
from imgchest_utils import upload_to_imgchest

def test_upload(filename):
    print(f"Testing upload for: {filename}")
    if not os.path.exists(filename):
        print(f"File {filename} does not exist.")
        return

    result = upload_to_imgchest(filename)
    if result:
        print("Upload succeeded!")
        print(result)
    else:
        print("Upload failed.")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        test_upload(sys.argv[1])
    else:
        test_upload("test_image.png")
