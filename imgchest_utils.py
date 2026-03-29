import json
import os

import requests


class ImgChestError(Exception):
    """Raised when ImgChest API fails (rate limit, service down, etc)."""
    pass


API_KEY = os.environ.get("IMGCHEST_API_KEY", "")

def _log(msg):
    print(f"[IMGCHEST] {msg}", flush=True)


def _error_detail_from_response(response):
    """Short, safe string for user-facing errors (no secrets expected in ImgChest JSON)."""
    raw = (response.text or "").strip()
    if not raw:
        return ""
    try:
        data = response.json()
        if isinstance(data, dict):
            for key in ("message", "error", "errors"):
                v = data.get(key)
                if isinstance(v, str) and v.strip():
                    return v.strip()[:400]
                if isinstance(v, list) and v and isinstance(v[0], str):
                    return "; ".join(v)[:400]
        return json.dumps(data)[:400]
    except (json.JSONDecodeError, TypeError, ValueError):
        return raw.replace("\n", " ")[:400]


# Connect + read timeouts so the worker does not hang until a proxy kills the connection (often seen as 502 + empty body).
_IMGCHEST_POST_TIMEOUT = (30, 120)


def upload_to_imgchest(file_path):
    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        _log("ERROR: API_KEY not set")
        raise ImgChestError("Image hosting API key not configured. Set IMGCHEST_API_KEY environment variable.")

    if not os.path.exists(file_path):
        _log(f"ERROR: File not found: {file_path}")
        return None

    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    _log(f"upload start: {file_path} ({file_size_mb:.2f} MB)")

    url = "https://api.imgchest.com/v1/post"
    headers = {
        "Authorization": f"Bearer {API_KEY}"
    }
    
    payload = {
        "title": os.path.basename(file_path),
        "privacy": "hidden",
        "nsfw": "false"
    }

    try:
        with open(file_path, "rb") as image_file:
            files = {
                "images[]": image_file
            }
            
            _log("sending POST to api.imgchest.com...")
            response = requests.post(
                url, headers=headers, data=payload, files=files, timeout=_IMGCHEST_POST_TIMEOUT
            )
            _log(f"response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                
                if 'data' not in data:
                    _log(f"unexpected response (no 'data' key): {list(data.keys()) if isinstance(data, dict) else type(data)}")
                    raise ImgChestError("Image hosting returned invalid response")
                
                img_data = data['data']

                post_link = img_data.get('url')
                if not post_link:
                    _log(f"note: 'url' key missing in response, keys: {list(img_data.keys())}")
                    post_link = "Not found in response"

                if 'images' in img_data and len(img_data['images']) > 0:
                    direct_link = img_data['images'][0]['link']
                else:
                    direct_link = "No direct link found"
                    _log("WARNING: no images in response")

                _log(f"upload SUCCESS: direct_link={direct_link[:80]}{'...' if len(direct_link) > 80 else ''}")
                return post_link, direct_link
            elif response.status_code == 429:
                _log(f"upload FAILED: rate limited (429)")
                raise ImgChestError("Image hosting rate limit reached. Please try again in a few minutes.")
            elif response.status_code >= 500:
                detail = _error_detail_from_response(response)
                _log(f"upload FAILED: server error {response.status_code}, body={response.text[:200]}")
                extra = f" ({detail})" if detail else ""
                raise ImgChestError(
                    f"Image hosting returned server error {response.status_code}.{extra} Please try again later."
                )
            else:
                detail = _error_detail_from_response(response)
                _log(f"upload FAILED: status={response.status_code}, body={response.text[:200]}")
                if detail:
                    raise ImgChestError(
                        f"Image hosting rejected the upload (HTTP {response.status_code}): {detail}"
                    )
                raise ImgChestError(
                    f"Image hosting rejected the upload (HTTP {response.status_code}). Please try again later."
                )

    except ImgChestError:
        raise
    except requests.Timeout as e:
        _log(f"upload TIMEOUT: {type(e).__name__}: {e}")
        raise ImgChestError(
            "Image hosting timed out while uploading. Your network may be slow or the service busy — try again, or use a smaller file."
        )
    except requests.RequestException as e:
        _log(f"upload REQUEST EXCEPTION: {type(e).__name__}: {e}")
        raise ImgChestError("Could not reach image hosting. Please check your connection and try again.")
    except Exception as e:
        _log(f"upload EXCEPTION: {type(e).__name__}: {e}")
        raise ImgChestError("Image upload failed. Please try again later.")
