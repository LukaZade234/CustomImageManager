# Deploying to DigitalOcean App Platform

1. Push this repo to GitHub, GitLab, or Bitbucket
2. Go to [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps) → **Create App** → select repo and branch
3. Set **IMGCHEST_API_KEY** in Settings → App-Level Environment Variables (required for uploads). Optional: **SECRET_KEY** (for future auth), **CORS_ORIGINS** (comma-separated allowed origins; default: allow all).
4. Optional: Set **DATABASE_URL** for PostgreSQL. Without it, data uses JSON files (ephemeral on redeploy). If adding a DB later:
   - Run `python migrate_to_db.py` to import custom_images, saved_characters, last_updated
   - Run `python import_characters_to_db.py` to import CharName.csv + character_image_mapping.json into characters
5. Launch the app

## Running Locally

```bash
export IMGCHEST_API_KEY=your_key
python upload_imgchest.py --web
```

Open http://localhost:5000
