import requests
import re
import sys
import os
import json
import io
import socket
import ipaddress
import uuid
from urllib.parse import urlparse, urlunparse, parse_qsl, urlencode

# Force UTF-8 for stdout/stderr to fix Windows console encoding errors
if sys.platform.startswith('win'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from flask import Flask, request, jsonify, send_from_directory, abort, Response
from flask_cors import CORS

# Import utility functions
from imgchest_utils import upload_to_imgchest, ImgChestError
from image_utils import convert_to_png, validate_image_file
import db

# Max file size (30MB) - reject larger files to avoid memory issues
MAX_FILE_SIZE = 30 * 1024 * 1024
# Drag-from-web: max image URLs per request
MAX_IMPORT_URLS = 20

# Allowed image extensions
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

# Character name validation
MAX_CHAR_NAME_LENGTH = 200
MAX_SERIES_LENGTH = 300
MAX_RANK_LENGTH = 50

# Match frontend dragImageUrls.js — strip when deduping web import batches
_IMPORT_URL_TRACKING_PARAMS = frozenset({
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', '_ga', 'mc_eid', 'igshid', 'ref', 'ref_src', 'spm', 'spm_id',
})


def _canonical_url_key_for_dedup(url):
    """Fragment + tracking params removed for stable equality (same image, different query strings)."""
    try:
        p = urlparse(url)
        if p.scheme not in ('http', 'https'):
            return (url or '').strip()
        netloc = (p.netloc or '').lower()
        pairs = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
                 if k.lower() not in _IMPORT_URL_TRACKING_PARAMS]
        pairs.sort(key=lambda x: (x[0].lower(), x[1]))
        query = urlencode(pairs)
        return urlunparse((p.scheme, netloc, p.path, p.params, query, ''))
    except Exception:
        return (url or '').split('#')[0].strip()


def _dedupe_import_urls_preserve_order(urls):
    seen = set()
    out = []
    for u in urls:
        if not u:
            continue
        key = _canonical_url_key_for_dedup(u)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(u)
    return out


def _allowed_image_proxy_url(url):
    """Only ImgChest hosts — same URLs we store from upload_to_imgchest (avoids CORS + SSRF)."""
    try:
        p = urlparse(url)
        if p.scheme not in ('http', 'https'):
            return False
        h = (p.hostname or '').lower()
        return h == 'imgchest.com' or h.endswith('.imgchest.com')
    except Exception:
        return False


def _host_resolves_only_to_public_ips(hostname):
    """Block SSRF: reject if any resolved address is loopback, private, link-local, etc."""
    try:
        hostname = (hostname or '').lower().rstrip('.')
        if not hostname or hostname == 'localhost':
            return False
        infos = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
        for res in infos:
            addr = res[4][0]
            ip = ipaddress.ip_address(addr)
            if ip.is_private or ip.is_loopback or ip.is_link_local:
                return False
            if ip.is_reserved or ip.is_multicast:
                return False
    except Exception:
        return False
    return True


def _safe_import_image_url(url):
    """
    Allow https/http image URLs from the public internet for drag-from-web import.
    Stricter than ImgChest-only proxy: still blocks obvious SSRF targets.
    """
    try:
        p = urlparse(url)
        if p.scheme not in ('http', 'https'):
            return False
        if p.username or p.password:
            return False
        h = (p.hostname or '').lower()
        if not h:
            return False
        if h in ('localhost', '127.0.0.1', '::1', '0.0.0.0'):
            return False
        if h.endswith('.local') or h.endswith('.localhost'):
            return False
        if h.startswith('169.254.'):  # link-local literal in hostname (unusual)
            return False
        if not _host_resolves_only_to_public_ips(h):
            return False
        return True
    except Exception:
        return False


def _request_headers_for_image_import(url):
    """
    Headers for fetching remote images. Pixiv CDN (pximg.net) returns 403 without a pixiv Referer.
    """
    headers = {
        'User-Agent': (
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
            '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ),
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
    }
    try:
        host = (urlparse(url).hostname or '').lower()
        if host.endswith('pximg.net') or host.endswith('pixiv.net') or host.endswith('pixiv.me'):
            # Per-artwork Referer when path includes Pixiv illustration id (e.g. .../119107915_p0.jpg)
            m = re.search(r'/(\d{6,})_p\d+', url)
            if m:
                headers['Referer'] = f'https://www.pixiv.net/artworks/{m.group(1)}'
            else:
                headers['Referer'] = 'https://www.pixiv.net/'
    except Exception:
        pass
    return headers


def _guess_ext_from_response(content_type, final_url):
    ct = (content_type or '').lower()
    if 'png' in ct:
        return '.png'
    if 'jpeg' in ct or 'jpg' in ct:
        return '.jpg'
    if 'gif' in ct:
        return '.gif'
    if 'webp' in ct:
        return '.webp'
    if 'bmp' in ct:
        return '.bmp'
    path = urlparse(final_url).path.lower()
    for ext in ALLOWED_IMAGE_EXTENSIONS:
        if path.endswith(ext):
            return ext
    return '.png'


def _fetch_image_from_url_for_import(url):
    """
    Download remote image to a temp file. Validates URL before and after redirects.
    Returns (temp_path, display_filename) or raises ValueError.
    """
    if not _safe_import_image_url(url):
        raise ValueError('URL not allowed or blocked (private hosts are not permitted)')
    r = requests.get(
        url,
        timeout=60,
        headers=_request_headers_for_image_import(url),
        allow_redirects=True,
        stream=True,
    )
    if not _safe_import_image_url(r.url):
        raise ValueError('Redirect target is not allowed')
    if r.status_code != 200:
        raise ValueError(f'Image server returned HTTP {r.status_code}')
    total = 0
    chunks = []
    for chunk in r.iter_content(chunk_size=65536):
        if chunk:
            total += len(chunk)
            if total > MAX_FILE_SIZE + 2 * 1024 * 1024:
                raise ValueError('Image too large')
            chunks.append(chunk)
    raw = b''.join(chunks)
    if not raw:
        raise ValueError('Empty response')
    ext = _guess_ext_from_response(r.headers.get('Content-Type', ''), r.url)
    safe = f'web_import_{uuid.uuid4().hex[:12]}{ext}'
    temp_path = os.path.join('.', 'temp_custom_' + safe)
    with open(temp_path, 'wb') as f:
        f.write(raw)
    return temp_path, safe


def _run_single_custom_upload_from_temp(temp_path, display_filename):
    """
    Validate, convert, upload one temp file to ImgChest.
    Returns (direct_link, None) on success, or (None, error_message).
    Removes temp files when done.
    """
    conversion_created_new_file = False
    final_path = temp_path
    try:
        file_size = os.path.getsize(temp_path)
        file_size_mb = file_size / (1024 * 1024)
        print(f"[UPLOAD] temp file: {temp_path} ({file_size_mb:.2f} MB)", flush=True)

        if file_size > MAX_FILE_SIZE:
            print(f"[UPLOAD] REJECT: {display_filename} too large", flush=True)
            if os.path.exists(temp_path):
                os.remove(temp_path)
            limit_mb = MAX_FILE_SIZE / (1024 * 1024)
            return None, (
                f"{display_filename}: File is {file_size_mb:.2f} MB; maximum allowed is {limit_mb:.0f} MB."
            )

        ok, val_err = validate_image_file(temp_path)
        if not ok:
            if os.path.exists(temp_path):
                os.remove(temp_path)
            return None, f"{display_filename}: {val_err}"

        filename_lower = display_filename.lower()
        if not filename_lower.endswith('.png') and not filename_lower.endswith('.gif'):
            print(f"[UPLOAD] converting {display_filename} to PNG", flush=True)
            converted_path, convert_error = convert_to_png(temp_path)
            if converted_path:
                final_path = converted_path
                conversion_created_new_file = True
                print(f"[UPLOAD] conversion OK, using {final_path}", flush=True)
            else:
                err_msg = f"{display_filename}: {convert_error}" if convert_error else f"{display_filename}: Failed to convert to PNG"
                print(f"[UPLOAD] conversion FAILED for {display_filename}: {convert_error}", flush=True)
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                return None, err_msg
        else:
            print(f"[UPLOAD] skipping conversion (already {filename_lower[-4:]}), using as-is", flush=True)

        final_size = os.path.getsize(final_path)
        if final_size > MAX_FILE_SIZE:
            final_mb = final_size / (1024 * 1024)
            limit_mb = MAX_FILE_SIZE / (1024 * 1024)
            print(f"[UPLOAD] REJECT: {display_filename} exceeds limit after processing ({final_size} bytes)", flush=True)
            return None, (
                f"{display_filename}: After processing the file is {final_mb:.2f} MB, which exceeds "
                f"ImgChest's limit of {limit_mb:.0f} MB."
            )

        try:
            print(f"[UPLOAD] uploading to ImgChest: {final_path}", flush=True)
            result = upload_to_imgchest(final_path)
            if result:
                post_link, direct_link = result
                print(f"[UPLOAD] SUCCESS: {display_filename}", flush=True)
                return direct_link, None
            print(f"[UPLOAD] FAILED (ImgChest): {display_filename}", flush=True)
            return None, f"{display_filename}: Image host did not return a link (unexpected). Try again."
        except ImgChestError as e:
            print(f"[UPLOAD] ImgChest error: {e}", flush=True)
            return None, str(e)
        except Exception as e:
            print(f"[UPLOAD] EXCEPTION: {display_filename}: {type(e).__name__}: {e}", flush=True)
            return None, f"Error uploading {display_filename}: {str(e)}"
    finally:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"[UPLOAD] cleaned temp: {temp_path}", flush=True)
            except Exception as cleanup_e:
                print(f"[UPLOAD] cleanup warning: could not remove {temp_path}: {cleanup_e}", flush=True)
        if conversion_created_new_file and os.path.exists(final_path):
            try:
                os.remove(final_path)
                print(f"[UPLOAD] cleaned converted: {final_path}", flush=True)
            except Exception as cleanup_e:
                print(f"[UPLOAD] cleanup warning: could not remove {final_path}: {cleanup_e}", flush=True)


def _validate_character_name(name):
    """Returns (True, None) or (False, error_message)."""
    if not name or not name.strip():
        return False, "Name cannot be empty"
    s = name.strip()
    if len(s) > MAX_CHAR_NAME_LENGTH:
        return False, f"Name too long (max {MAX_CHAR_NAME_LENGTH} characters)"
    if '..' in s or '/' in s or '\\' in s:
        return False, "Name contains invalid characters"
    if any(ord(c) < 32 and c not in '\t\n\r' for c in s):
        return False, "Name contains invalid control characters"
    return True, None


app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-key-change-in-production')

# CORS: set CORS_ORIGINS env (comma-separated) to restrict, e.g. "https://your-app.ondigitalocean.app,http://localhost:5000"
_origins = os.environ.get('CORS_ORIGINS', '*')
cors_origins = [o.strip() for o in _origins.split(',')] if _origins != '*' else '*'
CORS(app, origins=cors_origins)


@app.errorhandler(db.DatabaseConfigurationError)
def _handle_database_configuration_error(exc):
    return jsonify({'error': str(exc)}), 503


@app.route('/api/last-updated', methods=['GET'])
def get_last_updated():
    try:
        return jsonify(db.get_last_updated())
    except db.DatabaseConfigurationError:
        raise
    except Exception as e:
        print(f"Error reading last_updated: {e}")
    return jsonify({})

# React SPA: served from frontend/dist/ (built by GitHub Action, committed to repo)
_BASE = os.path.dirname(os.path.abspath(__file__))
SPA_DIR = os.path.join(_BASE, 'frontend', 'dist')
SPA_INDEX = os.path.join(SPA_DIR, 'index.html')


@app.route('/')
@app.route('/saved')
@app.route('/add')
@app.route('/customs')
@app.route('/character/<path:name>')
def index(name=None):
    if os.path.exists(SPA_INDEX):
        return send_from_directory(SPA_DIR, 'index.html')
    return (
        '<html><body><h1>Frontend not built</h1><p>Run the GitHub Action or: '
        '<code>cd frontend && npm install && npm run build</code></p></body></html>',
        503,
        {'Content-Type': 'text/html'}
    )

@app.route('/images/<filename>')
def get_image(filename):
    return send_from_directory('character_images', filename)

@app.route('/character_images/<path:filename>')
def get_character_image(filename):
    return send_from_directory('character_images', filename)

# Serve custom_images from PostgreSQL (JSON response; URL kept for API compatibility)
@app.route('/custom_images.json')
def serve_custom_images_json():
    try:
        return jsonify(db.get_custom_images())
    except db.DatabaseConfigurationError:
        raise
    except Exception as e:
        print(f"Error serving custom_images: {e}")
    return jsonify({})


@app.route('/api/download-image-proxy', methods=['POST'])
def download_image_proxy():
    """
    Fetch a remote image server-side so the browser can save it (avoids CORS on ImgChest URLs).
    """
    data = request.get_json(silent=True) or {}
    url = (data.get('url') or '').strip()
    if not url:
        return jsonify({'error': 'Missing url'}), 400
    if url.startswith('//'):
        url = 'https:' + url
    if not _allowed_image_proxy_url(url):
        return jsonify({'error': 'Only ImgChest image URLs can be proxied for download'}), 403
    try:
        r = requests.get(
            url,
            timeout=90,
            headers={'User-Agent': 'ImgManager/1.0'},
        )
        if r.status_code != 200:
            return jsonify({'error': f'Image server returned {r.status_code}'}), 502
        raw = r.content
        if len(raw) > MAX_FILE_SIZE + 2 * 1024 * 1024:
            return jsonify({'error': 'Image too large'}), 413
        ct = r.headers.get('Content-Type') or 'application/octet-stream'
        if 'image/' not in ct and 'octet-stream' not in ct:
            ct = 'application/octet-stream'
        return Response(raw, mimetype=ct)
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 502

# Serve SPA static assets (JS, CSS from frontend/dist/assets/)
@app.route('/assets/<path:filename>')
def get_spa_assets(filename):
    assets_dir = os.path.join(SPA_DIR, 'assets')
    if os.path.exists(assets_dir):
        return send_from_directory(assets_dir, filename)
    abort(404)

@app.route('/characters')
@app.route('/api/characters')
def get_characters():
    try:
        chars = db.get_characters()
        if chars is not None:
            return jsonify(chars)
        return jsonify({'error': 'Character data not loaded. Run import_characters_to_db.py with your CSV/mapping backup.'}), 503
    except Exception as e:
        print(f"Error reading characters: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    print(f"[UPLOAD] Starting single-file upload: {file.filename}", flush=True)

    # Save temporarily
    temp_path = os.path.join('.', 'temp_upload_' + file.filename)
    file.save(temp_path)
    file_size = os.path.getsize(temp_path)
    file_size_mb = file_size / (1024 * 1024)
    print(f"[UPLOAD] saved temp: {temp_path} ({file_size_mb:.2f} MB)", flush=True)

    if file_size > MAX_FILE_SIZE:
        print(f"[UPLOAD] REJECT: file too large ({file_size_mb:.2f} MB > {MAX_FILE_SIZE // (1024*1024)} MB)", flush=True)
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': f'File is {file_size_mb:.2f} MB; maximum allowed is {MAX_FILE_SIZE / (1024 * 1024):.0f} MB.'}), 400

    ok, err = validate_image_file(temp_path)
    if not ok:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': err}), 400

    print(f"[UPLOAD] file size OK, proceeding to ImgChest", flush=True)
    try:
        result = upload_to_imgchest(temp_path)
        if result:
            post_link, direct_link = result
            print(f"[UPLOAD] single-file upload SUCCESS: {file.filename}", flush=True)
            return jsonify({
                'success': True,
                'post_link': post_link,
                'direct_link': direct_link
            })
        else:
            print(f"[UPLOAD] single-file upload FAILED: {file.filename}", flush=True)
            return jsonify({'error': 'Image host did not return a link (unexpected). Try again.'}), 500
    except ImgChestError as e:
        print(f"[UPLOAD] ImgChest error: {e}", flush=True)
        return jsonify({'error': str(e)}), 503
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.route('/api/saved', methods=['GET'])
def get_saved():
    try:
        return jsonify(db.get_saved_characters())
    except Exception as e:
        print(f"Error reading saved characters: {e}")
    return jsonify([])

@app.route('/api/saved', methods=['POST'])
def save_character():
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Invalid character data'}), 400

    char_name = data['name']
    ok, err = _validate_character_name(char_name)
    if not ok:
        return jsonify({'error': err}), 400
    try:
        saved = db.get_saved_characters()
        if any(char.get('name') == char_name for char in saved):
            return jsonify({'error': 'Character already saved'}), 400
        saved.append(data)
        db.set_saved_characters(saved)
        db.update_last_modified(char_name)
        return jsonify({'success': True, 'message': 'Character saved'})
    except Exception as e:
        print(f"Error saving character: {e}")
        return jsonify({'error': 'Failed to save character'}), 500

# ... existing code ...


@app.route('/api/add-character', methods=['POST'])
def add_character():
    """Add a new character."""
    name = request.form.get('name', '').strip()
    if not name:
        json_data = request.get_json(silent=True)
        if json_data:
            name = str(json_data.get('name', '')).strip()
            series = str(json_data.get('series', '')).strip()
            rank = str(json_data.get('rank', '')).strip()
        else:
            return jsonify({'error': 'Name is required'}), 400
    else:
        series = request.form.get('series', '').strip()
        rank = request.form.get('rank', '').strip()

    ok, err = _validate_character_name(name)
    if not ok:
        return jsonify({'error': err}), 400
    if len(series) > MAX_SERIES_LENGTH:
        return jsonify({'error': f'Series too long (max {MAX_SERIES_LENGTH} characters)'}), 400
    if len(rank) > MAX_RANK_LENGTH:
        return jsonify({'error': f'Rank too long (max {MAX_RANK_LENGTH} characters)'}), 400

    image_url = ""

    if 'image' in request.files:
        file = request.files['image']
        if file.filename != '':
            temp_path = os.path.join('.', 'temp_add_' + file.filename)
            file.save(temp_path)
            try:
                result = upload_to_imgchest(temp_path)
                if result:
                    _, image_url = result
            except ImgChestError as e:
                print(f"Image upload failed: {e}")
                return jsonify({'error': str(e)}), 503
            except Exception as e:
                print(f"Image upload failed: {e}")
            finally:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

    try:
        if db.get_characters() is None:
            return jsonify({'error': 'Characters not migrated to DB yet. Run import_characters_to_db.py first.'}), 500
        if not db.add_character(name, series, rank, image_url):
            return jsonify({'error': f'Character "{name}" already exists'}), 400
        db.update_last_modified(name)
        return jsonify({'success': True, 'message': f'Added "{name}"'})
    except Exception as e:
        print(f'Error adding character: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/saved/<path:name>', methods=['DELETE'])
def remove_saved(name):
    try:
        saved = db.get_saved_characters()
        new_saved = [char for char in saved if char.get('name') != name]
        if len(new_saved) == len(saved):
            return jsonify({'error': 'Character not found in saved list'}), 404
        db.set_saved_characters(new_saved)
        return jsonify({'success': True, 'message': 'Character removed'})
    except Exception as e:
        print(f"Error removing character: {e}")
        return jsonify({'error': 'Failed to remove character'}), 500

@app.route('/api/custom-image', methods=['POST'])
def add_custom_image():
    try:
        if 'character_name' not in request.form:
            return jsonify({'error': 'Character name is required'}), 400

        char_name = request.form['character_name'].strip()
        ok, err = _validate_character_name(char_name)
        if not ok:
            return jsonify({'error': err}), 400
        
        # Handle multiple files
        files = request.files.getlist('files')
        # If no 'files' list, check for single 'file'
        if not files and 'file' in request.files:
            files = [request.files['file']]
            
        if not files or (len(files) == 1 and files[0].filename == ''):
            return jsonify({'error': 'No files selected'}), 400

        file_count = len([f for f in files if f.filename])
        print(f"[UPLOAD] Starting custom-image upload: {char_name}, {file_count} file(s)", flush=True)

        uploaded_links = []
        errors = []
        processed = 0

        for file in files:
            if file.filename == '':
                continue

            processed += 1
            print(f"[UPLOAD] Processing file {processed}/{file_count}: {file.filename}", flush=True)

            # Save temporarily
            temp_path = os.path.join('.', 'temp_custom_' + file.filename)
            file.save(temp_path)

            direct_link, one_err = _run_single_custom_upload_from_temp(temp_path, file.filename)
            if direct_link:
                uploaded_links.append(direct_link)
                print(f"[UPLOAD] file {processed}/{file_count} SUCCESS: {file.filename}", flush=True)
            else:
                errors.append(one_err or 'Unknown error')
                print(f"[UPLOAD] file {processed}/{file_count} failed: {file.filename}", flush=True)

        print(f"[UPLOAD] batch complete: {len(uploaded_links)} succeeded, {len(errors)} failed", flush=True)
        if not uploaded_links:
            main_error = errors[0] if errors else 'No files were successfully uploaded'
            return jsonify({'error': main_error, 'details': errors}), 500

        data = db.get_custom_images()
        if char_name not in data:
            data[char_name] = []
        data[char_name].extend(uploaded_links)
        db.set_custom_images(data)
        db.update_last_modified(char_name)
        print(f"[UPLOAD] updating custom_images for {char_name}, added {len(uploaded_links)} link(s)", flush=True)

        return jsonify({
            'success': True,
            'message': f'{len(uploaded_links)} images added',
            'links': uploaded_links,
            'errors': errors
        })
    except Exception as e:
        print(f"[UPLOAD] add_custom_image EXCEPTION: {type(e).__name__}: {e}", flush=True)
        return jsonify({
            'error': str(e),
            'details': [f'Server error: {type(e).__name__}']
        }), 500


@app.route('/api/import-custom-images-from-urls', methods=['POST'])
def import_custom_images_from_urls():
    """Fetch image URLs server-side (drag-from-web: Pinterest, etc.) and add as custom images."""
    try:
        data = request.get_json(silent=True) or {}
        char_name = (data.get('character_name') or '').strip()
        ok, err = _validate_character_name(char_name)
        if not ok:
            return jsonify({'error': err}), 400
        urls = data.get('urls')
        if not isinstance(urls, list) or not urls:
            return jsonify({'error': 'urls must be a non-empty array'}), 400
        urls = [str(u).strip() for u in urls if u]
        urls = _dedupe_import_urls_preserve_order(urls)[:MAX_IMPORT_URLS]
        if not urls:
            return jsonify({'error': 'No valid URLs'}), 400

        uploaded_links = []
        errors = []
        for idx, url in enumerate(urls):
            print(f"[IMPORT] fetching {idx + 1}/{len(urls)}: {url[:120]}...", flush=True)
            try:
                temp_path, display_filename = _fetch_image_from_url_for_import(url)
            except ValueError as e:
                errors.append(f"{url}: {e}")
                continue
            except Exception as e:
                errors.append(f"{url}: {str(e)}")
                continue
            direct_link, one_err = _run_single_custom_upload_from_temp(temp_path, display_filename)
            if direct_link:
                uploaded_links.append(direct_link)
            else:
                errors.append(one_err or 'Unknown error')

        print(f"[IMPORT] batch complete: {len(uploaded_links)} succeeded, {len(errors)} failed", flush=True)
        if not uploaded_links:
            main_error = errors[0] if errors else 'No images were imported'
            return jsonify({'error': main_error, 'details': errors}), 500

        custom_data = db.get_custom_images()
        if char_name not in custom_data:
            custom_data[char_name] = []
        custom_data[char_name].extend(uploaded_links)
        db.set_custom_images(custom_data)
        db.update_last_modified(char_name)
        print(f"[IMPORT] updating custom_images for {char_name}, added {len(uploaded_links)} link(s)", flush=True)

        return jsonify({
            'success': True,
            'message': f'{len(uploaded_links)} images added',
            'links': uploaded_links,
            'errors': errors
        })
    except Exception as e:
        print(f"[IMPORT] EXCEPTION: {type(e).__name__}: {e}", flush=True)
        return jsonify({
            'error': str(e),
            'details': [f'Server error: {type(e).__name__}']
        }), 500


@app.route('/api/custom-image/<path:char_name>', methods=['GET'])
def get_custom_images(char_name):
    try:
        data = db.get_custom_images()
        return jsonify(data.get(char_name, []))
    except Exception as e:
        print(f"Error reading custom images: {e}")
    return jsonify([])

@app.route('/api/reorder-custom-images', methods=['POST'])
def reorder_custom_images():
    try:
        req_data = request.json
        char_name = req_data.get('character_name')
        new_order = req_data.get('new_order')
        if not char_name or not new_order:
            return jsonify({'error': 'Missing required fields'}), 400

        data = db.get_custom_images()
        if char_name in data:
            data[char_name] = new_order
            db.set_custom_images(data)
            db.update_last_modified(char_name)
            return jsonify({'message': 'Order updated successfully'})
        else:
            return jsonify({'error': 'Character not found'}), 404
            
    except Exception as e:
        print(f"Error reordering images: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-custom-image', methods=['POST'])
def delete_custom_image():
    data = request.get_json()
    if not data or 'character_name' not in data or 'image_url' not in data:
        return jsonify({'error': 'Missing data'}), 400
    char_name = data['character_name']
    image_url = data['image_url']

    try:
        custom_data = db.get_custom_images()
        if char_name not in custom_data:
            return jsonify({'error': 'Character not found'}), 404
        if image_url not in custom_data[char_name]:
            return jsonify({'error': 'Image not found'}), 404
        custom_data[char_name].remove(image_url)
        db.set_custom_images(custom_data)
        db.update_last_modified(char_name)
        return jsonify({'success': True, 'message': 'Image deleted'})
    except Exception as e:
        print(f"Error deleting image: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-custom-images', methods=['POST'])
def delete_custom_images():
    data = request.get_json()
    if not data or 'character_name' not in data or 'image_urls' not in data:
        return jsonify({'error': 'Missing data'}), 400
    char_name = data['character_name']
    image_urls = data['image_urls']
    if not isinstance(image_urls, list):
        return jsonify({'error': 'image_urls must be a list'}), 400

    try:
        custom_data = db.get_custom_images()
        if char_name not in custom_data:
            return jsonify({'error': 'Character not found'}), 404
        current_list = custom_data[char_name]
        original_len = len(current_list)
        custom_data[char_name] = [url for url in current_list if url not in image_urls]
        if len(custom_data[char_name]) == original_len:
            return jsonify({'message': 'No images were deleted (none matched)'})

        db.set_custom_images(custom_data)
        db.update_last_modified(char_name)
        return jsonify({'success': True, 'message': 'Images deleted'})
    except Exception as e:
        print(f"Error deleting images: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/edit-character', methods=['POST'])
def edit_character():
    data = request.get_json()
    required = ['original_name', 'new_name', 'series', 'rank']
    if not data or not all(k in data for k in required):
        return jsonify({'error': 'Missing required fields'}), 400

    orig_name = data['original_name']
    new_name = data['new_name'].strip()
    series = data['series'].strip()
    rank = data['rank'].strip()

    if not new_name:
        return jsonify({'error': 'Name cannot be empty'}), 400

    ok, err = _validate_character_name(new_name)
    if not ok:
        return jsonify({'error': err}), 400
    if len(series) > MAX_SERIES_LENGTH:
        return jsonify({'error': f'Series too long (max {MAX_SERIES_LENGTH} characters)'}), 400
    if len(rank) > MAX_RANK_LENGTH:
        return jsonify({'error': f'Rank too long (max {MAX_RANK_LENGTH} characters)'}), 400

    try:
        if db.get_characters() is None:
            return jsonify({'error': 'Characters not migrated to DB yet. Run import_characters_to_db.py first.'}), 500
        if not db.update_character(orig_name, new_name, series, rank):
            return jsonify({'error': 'Character not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    if new_name != orig_name:
        try:
            custom_data = db.get_custom_images()
            if orig_name in custom_data:
                custom_data[new_name] = custom_data.pop(orig_name)
                db.set_custom_images(custom_data)
        except Exception as e:
            print(f"Error renaming custom_images: {e}")
        try:
            saved = db.get_saved_characters()
            for s in saved:
                if s.get('name') == orig_name:
                    s['name'] = new_name
                    db.set_saved_characters(saved)
                    break
        except Exception as e:
            print(f"Error renaming in saved_characters: {e}")
        try:
            last_upd = db.get_last_updated()
            if orig_name in last_upd:
                last_upd[new_name] = last_upd.pop(orig_name)
                db.set_last_updated(last_upd)
        except Exception as e:
            print(f"Error renaming in last_updated: {e}")

    db.update_last_modified(new_name)
    return jsonify({'success': True, 'message': 'Character updated', 'new_name': new_name})


@app.route('/api/set-main-image', methods=['POST'])
def set_main_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    if 'character_name' not in request.form:
        return jsonify({'error': 'Character name is required'}), 400

    file = request.files['file']
    char_name = request.form['character_name'].strip()

    ok, err = _validate_character_name(char_name)
    if not ok:
        return jsonify({'error': err}), 400

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    temp_path = os.path.join('.', 'temp_main_' + file.filename)
    file.save(temp_path)

    main_size = os.path.getsize(temp_path)
    if main_size > MAX_FILE_SIZE:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        main_mb = main_size / (1024 * 1024)
        return jsonify({'error': f'File is {main_mb:.2f} MB; maximum allowed is {MAX_FILE_SIZE / (1024 * 1024):.0f} MB.'}), 400

    ok, val_err = validate_image_file(temp_path)
    if not ok:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': val_err}), 400

    try:
        result = upload_to_imgchest(temp_path)
        if not result:
            return jsonify({'error': 'Failed to upload to ImgChest'}), 500

        post_link, direct_link = result

        if db.get_characters() is None:
            return jsonify({'error': 'Character data not loaded. Run import_characters_to_db.py first.'}), 503
        if db.set_main_image(char_name, direct_link):
            db.update_last_modified(char_name)
            return jsonify({'success': True, 'message': 'Main image updated', 'image_url': direct_link})
        return jsonify({'error': 'Character not found'}), 404
    except ImgChestError as e:
        print(f"Error setting main image (ImgChest): {e}")
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        print(f"Error setting main image: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == '--web':
        # Run web server
        print("Starting web server at http://localhost:5000")
        print("Open your browser to http://localhost:5000")
        app.run(debug=True, host='0.0.0.0', port=5000)
    elif len(sys.argv) > 1:
        # Command line usage
        file_path = sys.argv[1]
        upload_to_imgchest(file_path)
    else:
        # GUI file selector
        import tkinter as tk
        from tkinter import filedialog
        print("No file provided via arguments. Opening file selector...")
        root = tk.Tk()
        root.withdraw()
        
        file_path = filedialog.askopenfilename(
            title="Select Image to Upload",
            filetypes=[
                ("Images", "*.jpg *.jpeg *.png *.gif *.bmp *.webp"),
                ("All Files", "*.*")
            ]
        )

        if file_path:
            upload_to_imgchest(file_path)
        else:
            print("No file selected.")
