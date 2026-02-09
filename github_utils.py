import requests
import base64

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
