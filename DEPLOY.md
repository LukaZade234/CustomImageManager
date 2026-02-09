# Deploying to DigitalOcean App Platform

## Prerequisites

1. Push this repo to GitHub, GitLab, or Bitbucket
2. Run `python generate_mapping.py` before pushing (generates `character_mapping.js`)

## Deployment Steps

1. Go to [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. Click **Create App** → choose your repo and branch
3. App Platform will detect the web service from `.do/app.yaml`
4. Click **Next** through the wizard and **Launch App**

## If Build Fails with "static site output directory"

The app may have been created earlier as a static site. Update the spec:

1. Open your app in [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. Click **Settings** → **App Spec**
3. Replace the entire spec with the contents of `.do/app.yaml` (services only, no static_sites)
4. Click **Save** and redeploy

## Running Locally

To run locally with Add Character support:

```bash
python upload_imgchest.py --web
```

Then open http://localhost:5000

## After Updating character_image_mapping.json

Run `python generate_mapping.py` locally, then commit and push `character_mapping.js` to trigger a new deployment.
