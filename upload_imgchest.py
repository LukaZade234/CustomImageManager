import requests
import sys
import os
import csv
import json
from flask import Flask, request, jsonify, send_from_directory, abort

# Import utility functions
from github_utils import update_github_file
from imgchest_utils import upload_to_imgchest

app = Flask(__name__)

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
STATIC_FILES = {'styles.css', 'character_mapping.js', 'character_image_mapping.json', 'CharName.csv', 'app.js'}
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
    
    # Save temporarily
    temp_path = os.path.join('.', 'temp_upload_' + file.filename)
    file.save(temp_path)
    
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
    data = request.get_json()
    if not data or 'name' not in data:
        return jsonify({'error': 'Name is required'}), 400
    
    name = str(data.get('name', '')).strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    
    series = str(data.get('series', '')).strip()
    kakera = str(data.get('kakera', '0')).strip() or '0'
    
    # --- 1. Update Local Files (Ephemeral on Cloud) ---
    csv_path = 'CharName.csv'
    if not os.path.exists(csv_path):
        return jsonify({'error': 'CharName.csv not found'}), 500
    
    try:
        # Read and Append to CSV
        rows = []
        max_rank = 0
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                rows.append(row)
                try:
                    r = int(row.get('rank', 0))
                    if r > max_rank:
                        max_rank = r
                except (ValueError, TypeError):
                    pass
        
        if any(r.get('name') == name for r in rows):
            return jsonify({'error': f'Character "{name}" already exists'}), 400
        
        max_rank += 1
        new_row = {
            'rank': str(max_rank),
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
            mapping[name] = {"filename": ""}
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

    uploaded_links = []
    errors = []

    for file in files:
        if file.filename == '':
            continue
            
        # Save temporarily
        temp_path = os.path.join('.', 'temp_custom_' + file.filename)
        file.save(temp_path)
        
        try:
            # Reuse existing upload logic
            result = upload_to_imgchest(temp_path)
            
            if result:
                post_link, direct_link = result
                uploaded_links.append(direct_link)
            else:
                errors.append(f"Failed to upload {file.filename}")
        except Exception as e:
            errors.append(f"Error uploading {file.filename}: {str(e)}")
        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
    
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
