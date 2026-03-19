import requests
import sys
import os
import csv
import json
import io

# Force UTF-8 for stdout/stderr to fix Windows console encoding errors
if sys.platform.startswith('win'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from flask import Flask, request, jsonify, send_from_directory, abort
from flask_cors import CORS

# Import utility functions
from imgchest_utils import upload_to_imgchest, ImgChestError
from image_utils import convert_to_png, validate_image_file
import db

# Max file size (30MB) - reject larger files to avoid memory issues
MAX_FILE_SIZE = 30 * 1024 * 1024

# Allowed image extensions
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

# Character name validation
MAX_CHAR_NAME_LENGTH = 200
MAX_SERIES_LENGTH = 300
MAX_RANK_LENGTH = 50


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


@app.route('/api/last-updated', methods=['GET'])
def get_last_updated():
    try:
        return jsonify(db.get_last_updated())
    except Exception as e:
        print(f"Error reading last_updated: {e}")
    return jsonify({})

# React SPA: try multiple paths (Dockerfile uses /app, platform may use /workspace)
_BASE = os.path.dirname(os.path.abspath(__file__))
_SPA_CANDIDATES = [
    os.path.join(_BASE, 'frontend', 'dist'),
    '/app/frontend/dist',
    '/workspace/frontend/dist',
]
SPA_DIR = next((d for d in _SPA_CANDIDATES if os.path.exists(os.path.join(d, 'index.html'))), _SPA_CANDIDATES[0])
SPA_INDEX = os.path.join(SPA_DIR, 'index.html')

# Log at import so it appears in startup logs
print(f"[SPA] Looking for index at {SPA_INDEX}, exists={os.path.exists(SPA_INDEX)}", flush=True)
if not os.path.exists(SPA_INDEX):
    _parent = os.path.dirname(SPA_INDEX)
    print(f"[SPA] Parent dir exists={os.path.exists(_parent)}, contents={os.listdir(_parent) if os.path.exists(_parent) else 'N/A'}", flush=True)


@app.route('/')
@app.route('/saved')
@app.route('/add')
@app.route('/customs')
@app.route('/character/<path:name>')
def index(name=None):
    if os.path.exists(SPA_INDEX):
        return send_from_directory(SPA_DIR, 'index.html')
    return (
        f'<html><body><h1>Frontend not built</h1><p>Checked: {SPA_INDEX}</p>'
        '<p>Run: <code>cd frontend && npm install && npm run build</code></p></body></html>',
        503,
        {'Content-Type': 'text/html'}
    )

@app.route('/images/<filename>')
def get_image(filename):
    return send_from_directory('character_images', filename)

@app.route('/character_images/<path:filename>')
def get_character_image(filename):
    return send_from_directory('character_images', filename)

# Serve custom_images from database (or JSON fallback)
@app.route('/custom_images.json')
def serve_custom_images_json():
    try:
        return jsonify(db.get_custom_images())
    except Exception as e:
        print(f"Error serving custom_images: {e}")
    return jsonify({})

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
        # Fallback: not yet migrated
        characters = []
        mapping = {}
        if os.path.exists('character_image_mapping.json'):
            with open('character_image_mapping.json', 'r', encoding='utf-8') as f:
                mapping = json.load(f)
        if os.path.exists('CharName.csv'):
            with open('CharName.csv', 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    char_name = row['name']
                    image_filename = mapping.get(char_name, {}).get('filename', '')
                    characters.append({
                        'name': char_name,
                        'series': row['series'],
                        'rank': row['rank'],
                        'image': image_filename
                    })
        return jsonify(characters)
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
        return jsonify({'error': f'File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)'}), 400

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
            return jsonify({'error': 'Upload failed'}), 500
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
            file_size = os.path.getsize(temp_path)
            file_size_mb = file_size / (1024 * 1024)
            print(f"[UPLOAD] saved temp: {temp_path} ({file_size_mb:.2f} MB)", flush=True)

            if file_size > MAX_FILE_SIZE:
                print(f"[UPLOAD] REJECT: {file.filename} too large ({file_size_mb:.2f} MB > {MAX_FILE_SIZE // (1024*1024)} MB)", flush=True)
                errors.append(f"{file.filename}: File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                continue

            ok, val_err = validate_image_file(temp_path)
            if not ok:
                errors.append(f"{file.filename}: {val_err}")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                continue

            conversion_created_new_file = False
            final_path = temp_path
            
            # Convert to PNG if not already PNG or GIF
            filename_lower = file.filename.lower()
            if not filename_lower.endswith('.png') and not filename_lower.endswith('.gif'):
                print(f"[UPLOAD] converting {file.filename} to PNG", flush=True)
                converted_path, convert_error = convert_to_png(temp_path)
                if converted_path:
                    final_path = converted_path
                    conversion_created_new_file = True
                    print(f"[UPLOAD] conversion OK, using {final_path}", flush=True)
                else:
                    err_msg = f"{file.filename}: {convert_error}" if convert_error else f"{file.filename}: Failed to convert to PNG"
                    print(f"[UPLOAD] conversion FAILED for {file.filename}: {convert_error}", flush=True)
                    errors.append(err_msg)
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                    continue
            else:
                print(f"[UPLOAD] skipping conversion (already {filename_lower[-4:]}), using as-is", flush=True)
            
            try:
                print(f"[UPLOAD] uploading to ImgChest: {final_path}", flush=True)
                result = upload_to_imgchest(final_path)
                
                if result:
                    post_link, direct_link = result
                    uploaded_links.append(direct_link)
                    print(f"[UPLOAD] file {processed}/{file_count} SUCCESS: {file.filename}", flush=True)
                else:
                    errors.append(f"Failed to upload {file.filename}")
                    print(f"[UPLOAD] file {processed}/{file_count} FAILED (ImgChest): {file.filename}", flush=True)
            except ImgChestError as e:
                errors.append(str(e))
                print(f"[UPLOAD] file {processed}/{file_count} ImgChest error: {e}", flush=True)
            except Exception as e:
                errors.append(f"Error uploading {file.filename}: {str(e)}")
                print(f"[UPLOAD] file {processed}/{file_count} EXCEPTION: {file.filename}: {type(e).__name__}: {e}", flush=True)
            finally:
                # Clean up files
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

    if os.path.getsize(temp_path) > MAX_FILE_SIZE:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': f'File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)'}), 400

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

        if db.get_characters() is not None:
            if db.set_main_image(char_name, direct_link):
                db.update_last_modified(char_name)
                return jsonify({'success': True, 'message': 'Main image updated', 'image_url': direct_link})
            return jsonify({'error': 'Character not found'}), 404

        # Fallback: not yet migrated, update JSON file
        json_file = 'character_image_mapping.json'
        mapping = {}
        if os.path.exists(json_file):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
            except Exception:
                pass
        mapping[char_name] = {"filename": direct_link}
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=4, ensure_ascii=False)
        return jsonify({'success': True, 'message': 'Main image updated', 'image_url': direct_link})
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
