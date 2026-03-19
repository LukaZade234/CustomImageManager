#!/usr/bin/env python3
"""
Migrate existing JSON files to the database.
Run with DATABASE_URL set to your PostgreSQL connection string.
Example: DATABASE_URL=postgresql://... python migrate_to_db.py
"""
import os
import json
import db

FILES = [
    ('custom_images', 'custom_images.json'),
    ('saved_characters', 'saved_characters.json'),
    ('last_updated', 'last_updated.json'),
]


def main():
    if not os.environ.get('DATABASE_URL'):
        print("Set DATABASE_URL to your PostgreSQL connection string.")
        return 1

    for name, path in FILES:
        if not os.path.exists(path):
            print(f"Skip {path} (not found)")
            continue
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"Error reading {path}: {e}")
            continue

        getter = getattr(db, f'get_{name}')
        existing = getter()
        if existing and name == 'custom_images' and isinstance(existing, dict) and len(existing) > 0:
            print(f"Skip {path} (db already has data)")
            continue
        if existing and name == 'saved_characters' and len(existing) > 0:
            print(f"Skip {path} (db already has data)")
            continue
        if existing and name == 'last_updated' and len(existing) > 0:
            print(f"Skip {path} (db already has data)")
            continue

        getattr(db, f'set_{name}')(data)
        print(f"Migrated {path} -> database")
    return 0


if __name__ == '__main__':
    exit(main())
