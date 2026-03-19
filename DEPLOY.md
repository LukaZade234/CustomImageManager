# Deploying to DigitalOcean App Platform

1. Push this repo to GitHub, GitLab, or Bitbucket
2. Go to [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps) → **Create App** → select repo and branch
3. Set **IMGCHEST_API_KEY** in Settings → App-Level Environment Variables (required for uploads)
4. Optional: Set **DATABASE_URL** for PostgreSQL. Without it, data uses JSON files (ephemeral on redeploy; use GitHub sync for persistence). If adding a DB later, run `python migrate_to_db.py` to import existing JSON data.
5. Launch the app

## Running Locally

```bash
export IMGCHEST_API_KEY=your_key
python upload_imgchest.py --web
```

Open http://localhost:5000
