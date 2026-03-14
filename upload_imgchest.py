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

# Import utility functions
from github_utils import update_github_file
from imgchest_utils import upload_to_imgchest
from image_utils import convert_to_png

import time

# Max file size (20MB) - reject larger files to avoid memory issues
MAX_FILE_SIZE = 20 * 1024 * 1024

app = Flask(__name__)

# --- Helper for Last Modified Tracking ---
LAST_UPDATED_FILE = 'last_updated.json'

def update_last_modified(char_name):
    """Updates the last modified timestamp for a character."""
    timestamps = {}
    if os.path.exists(LAST_UPDATED_FILE):
        try:
            with open(LAST_UPDATED_FILE, 'r', encoding='utf-8') as f:
                timestamps = json.load(f)
        except:
            pass
            
    timestamps[char_name] = time.time()
    
    try:
        with open(LAST_UPDATED_FILE, 'w', encoding='utf-8') as f:
            json.dump(timestamps, f, indent=4)
    except Exception as e:
        print(f"Error updating timestamp: {e}")

@app.route('/api/last-updated', methods=['GET'])
def get_last_updated():
    if os.path.exists(LAST_UPDATED_FILE):
        return send_from_directory('.', LAST_UPDATED_FILE)
    return jsonify({})

@app.route('/')
@app.route('/saved')
@app.route('/add')
@app.route('/character/<path:name>')
def index(name=None):
    return send_from_directory('.', 'upload.html')

@app.route('/images/<filename>')
def get_image(filename):
    return send_from_directory('character_images', filename)

@app.route('/character_images/<path:filename>')
def get_character_image(filename):
    return send_from_directory('character_images', filename)

# Serve static assets (CSS, JS, JSON, CSV)
STATIC_FILES = {'styles.css', 'character_mapping.js', 'character_image_mapping.json', 'CharName.csv', 'app.js', 'custom_images.json'}
@app.route('/<filename>')
def get_static(filename):
    if filename in STATIC_FILES and os.path.exists(filename):
        return send_from_directory('.', filename)
    abort(404)

@app.route('/characters')
def get_characters():
    characters = []
    mapping = {}
    try:
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
    except Exception as e:
        print(f"Error reading files: {e}")
        return jsonify({'error': str(e)}), 500
    return jsonify(characters)

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

    if os.path.getsize(temp_path) > MAX_FILE_SIZE:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return jsonify({'error': f'File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)'}), 400

    try:
        result = upload_to_imgchest(temp_path)
        if result:
            post_link, direct_link = result
            return jsonify({
                'success': True,
                'post_link': post_link,
                'direct_link': direct_link
            })
        else:
            return jsonify({'error': 'Upload failed'}), 500
    finally:
        # Clean up temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.route('/api/saved', methods=['GET'])
def get_saved():
    saved_file = 'saved_characters.json'
    if not os.path.exists(saved_file):
        return jsonify([])
        
    try:
        with open(saved_file, 'r', encoding='utf-8') as f:
            saved = json.load(f)
        return jsonify(saved)
    except Exception as e:
        print(f"Error reading saved characters: {e}")
        return jsonify([])

@app.route('/api/saved', methods=['POST'])
def save_character():
    saved_file = 'saved_characters.json'
    data = request.get_json()
    
    if not data or 'name' not in data:
        return jsonify({'error': 'Invalid character data'}), 400
    
    # Load existing saved characters
    saved = []
    if os.path.exists(saved_file):
        try:
            with open(saved_file, 'r', encoding='utf-8') as f:
                saved = json.load(f)
        except Exception as e:
            print(f"Error reading saved characters: {e}")
            saved = []
    
    # Check if character already exists
    char_name = data['name']
    if any(char.get('name') == char_name for char in saved):
        return jsonify({'error': 'Character already saved'}), 400
    
    # Add character to saved list
    saved.append(data)
    
    # Save to file
    try:
        with open(saved_file, 'w', encoding='utf-8') as f:
            json.dump(saved, f, indent=2, ensure_ascii=False)
            
        # GitHub Sync
        github_token = os.environ.get('GITHUB_TOKEN')
        github_repo = os.environ.get('GITHUB_REPO')
        
        if github_token and github_repo:
            try:
                json_content = json.dumps(saved, ensure_ascii=False, indent=2)
                update_github_file(
                    github_repo, 
                    saved_file, 
                    json_content, 
                    f"Save character: {char_name}", 
                    github_token
                )
            except Exception as gh_e:
                print(f"GitHub Sync Error: {gh_e}")
                
        return jsonify({'success': True, 'message': 'Character saved'})
    except Exception as e:
        print(f"Error saving character: {e}")
        return jsonify({'error': 'Failed to save character'}), 500

# ... existing code ...


@app.route('/api/add-character', methods=['POST'])
def add_character():
    """Append a new character to CharName.csv (Local + GitHub Sync)."""
    # Switch to request.form for multipart/form-data support
    name = request.form.get('name', '').strip()
    if not name:
        # Fallback to JSON if not form data (for backward compatibility if needed)
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

    # Kakera is removed from UI, default to 0 for CSV compatibility
    kakera = '0'
    
    # --- 1. Update Local Files (Ephemeral on Cloud) ---
    csv_path = 'CharName.csv'
    if not os.path.exists(csv_path):
        return jsonify({'error': 'CharName.csv not found'}), 500
    
    try:
        # Read existing to check duplicates
        rows = []
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                rows.append(row)
        
        if any(r.get('name') == name for r in rows):
            return jsonify({'error': f'Character "{name}" already exists'}), 400
        
        # Rank Logic: Only assign if provided, otherwise leave blank
        # Previously auto-assigned max_rank + 1
        final_rank = rank if rank else ""
        
        new_row = {
            'rank': final_rank,
            'name': name,
            'series': series,
            'kakera': kakera
        }
        rows.append(new_row)
        
        # Write CSV
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
        
        # Handle Main Image Upload
        image_url = ""
        if 'image' in request.files:
            file = request.files['image']
            if file.filename != '':
                # Save temporarily
                temp_path = os.path.join('.', 'temp_add_' + file.filename)
                file.save(temp_path)
                try:
                    result = upload_to_imgchest(temp_path)
                    if result:
                        _, image_url = result
                except Exception as e:
                    print(f"Image upload failed: {e}")
                finally:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)

        # Update Mapping JSON
        mapping_path = 'character_image_mapping.json'
        mapping = {}
        if os.path.exists(mapping_path):
            try:
                with open(mapping_path, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
            except:
                pass
        
        if name not in mapping:
            mapping[name] = {"filename": image_url}
            with open(mapping_path, 'w', encoding='utf-8') as f:
                json.dump(mapping, f, ensure_ascii=False, indent=4)

        # --- 2. GitHub Sync (If Configured) ---
        github_token = os.environ.get('GITHUB_TOKEN')
        github_repo = os.environ.get('GITHUB_REPO') # e.g. "username/repo"
        
        sync_msg = ""
        if github_token and github_repo:
            try:
                # Re-construct CSV content
                from io import StringIO
                output = StringIO()
                writer = csv.DictWriter(output, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(rows)
                csv_content = output.getvalue()
                
                # Re-construct JSON content
                json_content = json.dumps(mapping, ensure_ascii=False, indent=4)
                
                # Commit CSV
                ok_csv = update_github_file(
                    github_repo, 
                    'CharName.csv', 
                    csv_content, 
                    f"Add character: {name} (CSV)", 
                    github_token
                )
                
                # Commit JSON
                ok_json = update_github_file(
                    github_repo, 
                    'character_image_mapping.json', 
                    json_content, 
                    f"Add character: {name} (Mapping)", 
                    github_token
                )
                
                if ok_csv and ok_json:
                    sync_msg = " & Synced to GitHub!"
                else:
                    sync_msg = " (GitHub Sync Failed)"
            except Exception as gh_e:
                print(f"GitHub Sync Error: {gh_e}")
                sync_msg = " (GitHub Sync Error)"

        return jsonify({'success': True, 'message': f'Added "{name}"{sync_msg}'})
    except Exception as e:
        print(f'Error adding character: {e}')
        return jsonify({'error': str(e)}), 500

@app.route('/api/saved/<path:name>', methods=['DELETE'])
def remove_saved(name):
    saved_file = 'saved_characters.json'
    
    if not os.path.exists(saved_file):
        return jsonify({'error': 'No saved characters found'}), 404
    
    try:
        with open(saved_file, 'r', encoding='utf-8') as f:
            saved = json.load(f)
        
        # Remove character by name
        new_saved = [char for char in saved if char.get('name') != name]
        
        if len(new_saved) == len(saved):
             return jsonify({'error': 'Character not found in saved list'}), 404
             
        with open(saved_file, 'w', encoding='utf-8') as f:
            json.dump(new_saved, f, indent=2, ensure_ascii=False)
            
        # GitHub Sync
        github_token = os.environ.get('GITHUB_TOKEN')
        github_repo = os.environ.get('GITHUB_REPO')
        
        if github_token and github_repo:
            try:
                json_content = json.dumps(new_saved, ensure_ascii=False, indent=2)
                update_github_file(
                    github_repo, 
                    saved_file, 
                    json_content, 
                    f"Unsave character: {name}", 
                    github_token
                )
            except Exception as gh_e:
                print(f"GitHub Sync Error: {gh_e}")
        
        return jsonify({'success': True, 'message': 'Character removed'})
    except Exception as e:
        print(f"Error removing character: {e}")
        return jsonify({'error': 'Failed to remove character'}), 500

@app.route('/api/custom-image', methods=['POST'])
def add_custom_image():
    if 'character_name' not in request.form:
        return jsonify({'error': 'Character name is required'}), 400
        
    char_name = request.form['character_name']
    
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

        if os.path.getsize(temp_path) > MAX_FILE_SIZE:
            errors.append(f"{file.filename}: File too large (max {MAX_FILE_SIZE // (1024*1024)}MB)")
            if os.path.exists(temp_path):
                os.remove(temp_path)
            continue

        conversion_created_new_file = False
        final_path = temp_path
        
        # Convert to PNG if not already PNG or GIF
        filename_lower = file.filename.lower()
        if not filename_lower.endswith('.png') and not filename_lower.endswith('.gif'):
            converted_path = convert_to_png(temp_path)
            if converted_path:
                final_path = converted_path
                conversion_created_new_file = True
            else:
                errors.append(f"{file.filename}: Failed to convert to PNG (image may be too large or corrupted).")
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                continue
        
        try:
            # Upload to ImgChest
            result = upload_to_imgchest(final_path)
            
            if result:
                post_link, direct_link = result
                uploaded_links.append(direct_link)
            else:
                errors.append(f"Failed to upload {file.filename}")
        except Exception as e:
            errors.append(f"Error uploading {file.filename}: {str(e)}")
        finally:
            # Clean up files
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
            if conversion_created_new_file and os.path.exists(final_path):
                try:
                    os.remove(final_path)
                except:
                    pass
    
    if not uploaded_links:
        return jsonify({'error': 'No files were successfully uploaded', 'details': errors}), 500
        
    # Update custom_images.json
    json_file = 'custom_images.json'
    data = {}
    
    if os.path.exists(json_file):
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except:
            pass
    
    # Initialize list if not exists
    if char_name not in data:
        data[char_name] = []
        
    # Add links
    data[char_name].extend(uploaded_links)
    
    # Save locally
    with open(json_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
        
    # Update Timestamp
    update_last_modified(char_name)
        
    # GitHub Sync
    github_token = os.environ.get('GITHUB_TOKEN')
    github_repo = os.environ.get('GITHUB_REPO')
    
    sync_msg = ""
    if github_token and github_repo:
        try:
            json_content = json.dumps(data, ensure_ascii=False, indent=4)
            update_github_file(
                github_repo, 
                json_file, 
                json_content, 
                f"Add {len(uploaded_links)} custom images for: {char_name}", 
                github_token
            )
            sync_msg = " & Synced to GitHub"
        except Exception as gh_e:
            print(f"GitHub Sync Error: {gh_e}")
            sync_msg = " (GitHub Sync Failed)"
            
    return jsonify({
        'success': True, 
        'message': f'{len(uploaded_links)} images added{sync_msg}',
        'links': uploaded_links,
        'errors': errors
    })

@app.route('/api/custom-image/<path:char_name>', methods=['GET'])
def get_custom_images(char_name):
    json_file = 'custom_images.json'
    if not os.path.exists(json_file):
        return jsonify([])
        
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Return list of images or empty list
        return jsonify(data.get(char_name, []))
    except Exception as e:
        print(f"Error reading custom images: {e}")
        return jsonify([])

@app.route('/api/reorder-custom-images', methods=['POST'])
def reorder_custom_images():
    try:
        data = request.json
        char_name = data.get('character_name')
        new_order = data.get('new_order')
        
        if not char_name or not new_order:
            return jsonify({'error': 'Missing required fields'}), 400
            
        json_file = 'custom_images.json'
        if not os.path.exists(json_file):
            return jsonify({'error': 'No custom images found'}), 404
            
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        if char_name in data:
            data[char_name] = new_order
            
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4, ensure_ascii=False)
                
            # GitHub Sync
            github_token = os.environ.get('GITHUB_TOKEN')
            github_repo = os.environ.get('GITHUB_REPO')
            
            if github_token and github_repo:
                try:
                    json_content = json.dumps(data, ensure_ascii=False, indent=4)
                    update_github_file(
                        github_repo, 
                        json_file, 
                        json_content, 
                        f"Reorder images for: {char_name}", 
                        github_token
                    )
                except Exception as gh_e:
                    print(f"GitHub Sync Error: {gh_e}")
                    
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
    json_file = 'custom_images.json'
    
    if not os.path.exists(json_file):
        return jsonify({'error': 'File not found'}), 404
        
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            custom_data = json.load(f)
            
        if char_name in custom_data:
            if image_url in custom_data[char_name]:
                custom_data[char_name].remove(image_url)
                
                # Save locally
                with open(json_file, 'w', encoding='utf-8') as f:
                    json.dump(custom_data, f, indent=4, ensure_ascii=False)
                    
                # Sync GitHub
                github_token = os.environ.get('GITHUB_TOKEN')
                github_repo = os.environ.get('GITHUB_REPO')
                sync_msg = ""
                
                if github_token and github_repo:
                    try:
                        json_content = json.dumps(custom_data, ensure_ascii=False, indent=4)
                        update_github_file(
                            github_repo, 
                            json_file, 
                            json_content, 
                            f"Delete custom image for: {char_name}", 
                            github_token
                        )
                        sync_msg = " & Synced to GitHub"
                    except Exception as gh_e:
                        print(f"GitHub Sync Error: {gh_e}")
                        sync_msg = " (GitHub Sync Failed)"
                
                return jsonify({'success': True, 'message': f'Image deleted{sync_msg}'})
            else:
                return jsonify({'error': 'Image not found'}), 404
        else:
            return jsonify({'error': 'Character not found'}), 404
            
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
        
    json_file = 'custom_images.json'
    
    if not os.path.exists(json_file):
        return jsonify({'error': 'File not found'}), 404
        
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            custom_data = json.load(f)
            
        if char_name in custom_data:
            current_list = custom_data[char_name]
            original_len = len(current_list)
            
            # Remove images
            custom_data[char_name] = [url for url in current_list if url not in image_urls]
            
            if len(custom_data[char_name]) == original_len:
                 return jsonify({'message': 'No images were deleted (none matched)'})
            
            # Save locally
            with open(json_file, 'w', encoding='utf-8') as f:
                json.dump(custom_data, f, indent=4, ensure_ascii=False)
                
            # Sync GitHub
            github_token = os.environ.get('GITHUB_TOKEN')
            github_repo = os.environ.get('GITHUB_REPO')
            sync_msg = ""
            
            if github_token and github_repo:
                try:
                    json_content = json.dumps(custom_data, ensure_ascii=False, indent=4)
                    update_github_file(
                        github_repo, 
                        json_file, 
                        json_content, 
                        f"Delete {original_len - len(custom_data[char_name])} custom images for: {char_name}", 
                        github_token
                    )
                    sync_msg = " & Synced to GitHub"
                except Exception as gh_e:
                    print(f"GitHub Sync Error: {gh_e}")
                    sync_msg = " (GitHub Sync Failed)"
            
            return jsonify({'success': True, 'message': f'Images deleted{sync_msg}'})
        else:
            return jsonify({'error': 'Character not found'}), 404
            
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
        
    # 1. Update CSV
    csv_path = 'CharName.csv'
    if not os.path.exists(csv_path):
        return jsonify({'error': 'CharName.csv not found'}), 500
        
    rows = []
    updated = False
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                if row['name'] == orig_name:
                    row['name'] = new_name
                    row['series'] = series
                    row['rank'] = rank
                    updated = True
                rows.append(row)
        
        if not updated:
            return jsonify({'error': 'Character not found in CSV'}), 404
            
        # Write CSV
        with open(csv_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
    except Exception as e:
        return jsonify({'error': f"CSV Error: {e}"}), 500

    # 2. Rename keys in JSON files if name changed
    rename_json_error = None
    files_to_update = {} # path -> content
    
    if new_name != orig_name:
        # Mapping JSON
        mapping_path = 'character_image_mapping.json'
        if os.path.exists(mapping_path):
            try:
                with open(mapping_path, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
                if orig_name in mapping:
                    mapping[new_name] = mapping.pop(orig_name)
                    with open(mapping_path, 'w', encoding='utf-8') as f:
                        json.dump(mapping, f, indent=4, ensure_ascii=False)
                    files_to_update[mapping_path] = json.dumps(mapping, ensure_ascii=False, indent=4)
            except Exception as e:
                rename_json_error = str(e)

        # Custom Images JSON
        custom_path = 'custom_images.json'
        if os.path.exists(custom_path):
            try:
                with open(custom_path, 'r', encoding='utf-8') as f:
                    custom_data = json.load(f)
                if orig_name in custom_data:
                    custom_data[new_name] = custom_data.pop(orig_name)
                    with open(custom_path, 'w', encoding='utf-8') as f:
                        json.dump(custom_data, f, indent=4, ensure_ascii=False)
                    files_to_update[custom_path] = json.dumps(custom_data, ensure_ascii=False, indent=4)
            except Exception as e:
                rename_json_error = str(e)
                
    # 3. GitHub Sync
    github_token = os.environ.get('GITHUB_TOKEN')
    github_repo = os.environ.get('GITHUB_REPO')
    sync_msg = ""
    
    if github_token and github_repo:
        try:
            # Sync CSV
            from io import StringIO
            output = StringIO()
            writer = csv.DictWriter(output, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            csv_content = output.getvalue()
            
            update_github_file(github_repo, csv_path, csv_content, f"Edit character: {orig_name} -> {new_name}", github_token)
            
            # Sync JSONs
            for path, content in files_to_update.items():
                update_github_file(github_repo, path, content, f"Rename key: {orig_name} -> {new_name}", github_token)
                
            sync_msg = " & Synced to GitHub"
        except Exception as gh_e:
            print(f"GitHub Sync Error: {gh_e}")
            sync_msg = " (GitHub Sync Failed)"

    return jsonify({'success': True, 'message': f'Character updated{sync_msg}', 'new_name': new_name})


@app.route('/api/set-main-image', methods=['POST'])
def set_main_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    if 'character_name' not in request.form:
        return jsonify({'error': 'Character name is required'}), 400
        
    file = request.files['file']
    char_name = request.form['character_name']
    
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Save temporarily
    temp_path = os.path.join('.', 'temp_main_' + file.filename)
    file.save(temp_path)
    
    try:
        # Upload to ImgChest
        result = upload_to_imgchest(temp_path)
        
        if not result:
            return jsonify({'error': 'Failed to upload to ImgChest'}), 500
            
        post_link, direct_link = result
        
        # Update character_image_mapping.json
        json_file = 'character_image_mapping.json'
        mapping = {}
        
        if os.path.exists(json_file):
            try:
                with open(json_file, 'r', encoding='utf-8') as f:
                    mapping = json.load(f)
            except:
                pass
        
        # Update mapping
        mapping[char_name] = {"filename": direct_link}
        
        # Save locally
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(mapping, f, indent=4, ensure_ascii=False)
            
        # GitHub Sync
        github_token = os.environ.get('GITHUB_TOKEN')
        github_repo = os.environ.get('GITHUB_REPO')
        
        sync_msg = ""
        if github_token and github_repo:
            try:
                json_content = json.dumps(mapping, ensure_ascii=False, indent=4)
                update_github_file(
                    github_repo, 
                    json_file, 
                    json_content, 
                    f"Set main image for: {char_name}", 
                    github_token
                )
                sync_msg = " & Synced to GitHub"
            except Exception as gh_e:
                print(f"GitHub Sync Error: {gh_e}")
                sync_msg = " (GitHub Sync Failed)"
                
        return jsonify({
            'success': True, 
            'message': f'Main image updated{sync_msg}',
            'image_url': direct_link
        })
        
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
