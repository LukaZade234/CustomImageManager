import requests
import sys
import os
import csv
import json
from flask import Flask, request, jsonify, send_from_directory, abort

# ---------------------------------------------------------------------
API_KEY = "QG2Em4u8ux4HtIYGUC04s2whSzhNFNqDwRqJD2dF1034102b"
# ---------------------------------------------------------------------

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
STATIC_FILES = {'styles.css', 'character_mapping.js', 'character_image_mapping.json', 'CharName.csv'}
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

import base64

# ... existing code ...

def update_github_file(repo, path, content, message, token, branch='main'):
    """Updates a file on GitHub via API."""
    url = f"https://api.github.com/repos/{repo}/contents/{path}"
    headers = {"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"}
    
    # 1. Get current file SHA
    r = requests.get(url, headers=headers, params={"ref": branch})
    if r.status_code == 200:
        sha = r.json()['sha']
    else:
        # File doesn't exist? (Handle or fail)
        print(f"File {path} not found on GitHub, cannot update.")
        return False

    # 2. Commit update
    data = {
        "message": message + " [skip ci]", # Skip CI to avoid redeploy loops
        "content": base64.b64encode(content.encode('utf-8')).decode('utf-8'),
        "sha": sha,
        "branch": branch
    }
    r = requests.put(url, headers=headers, json=data)
    if r.status_code in [200, 201]:
        return True
    else:
        print(f"Failed to update GitHub: {r.text}")
        return False

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

def upload_to_imgchest(file_path):
    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("Error: Please set your API_KEY in the script file.")
        return

    if not os.path.exists(file_path):
        print(f"Error: File not found at {file_path}")
        return

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
            
            print(f"Uploading {file_path}...")
            response = requests.post(url, headers=headers, data=payload, files=files)
            
            if response.status_code == 200:
                data = response.json()
                
                if 'data' not in data:
                    print(f"Upload successful but unexpected response: {data}")
                    return
                
                img_data = data['data']

                post_link = img_data.get('url')
                if not post_link:
                     print(f"Debug: 'url' key missing. Response keys: {list(img_data.keys())}")
                     post_link = "Not found in response"

                if 'images' in img_data and len(img_data['images']) > 0:
                    direct_link = img_data['images'][0]['link']
                else:
                    direct_link = "No direct link found"

                print("\n--- Upload Successful ---")
                print(f"Post Link:   {post_link}")
                print(f"Direct Link: {direct_link}")
                return post_link, direct_link
            else:
                print(f"Upload failed. Status Code: {response.status_code}")
                print(f"Response: {response.text}")

    except Exception as e:
        print(f"An error occurred: {e}")

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
