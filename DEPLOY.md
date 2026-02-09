# Deploying to DigitalOcean App Platform

## Prerequisites

1. Push this repo to GitHub, GitLab, or Bitbucket
2. Run `python generate_mapping.py` before pushing (generates `character_mapping.js`)

## Deployment Steps

1. Go to [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. Click **Create App** → choose your repo and branch
3. App Platform will detect the static site from `.do/app.yaml`
4. Click **Next** through the wizard and **Launch App**

## After Updating character_image_mapping.json

Run `python generate_mapping.py` locally, then commit and push `character_mapping.js` to trigger a new deployment.

## Static Site Requirements Met

- `index.html` at repo root (required for detection)
- `catchall_document: index.html` for hash-based routing (#/saved, #/character/Name)
- No server runtime needed—pure static files served via CDN
