import requests
import os

API_KEY = "QG2Em4u8ux4HtIYGUC04s2whSzhNFNqDwRqJD2dF1034102b"

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
