#!/usr/bin/env python3
"""
Import CharName.csv + character_image_mapping.json into the characters DB.
Run with DATABASE_URL set for PostgreSQL, or without for JSON fallback.
Example: DATABASE_URL=postgresql://... python import_characters_to_db.py
"""
import csv
import json
import os
import db


def main():
    csv_path = 'CharName.csv'
    mapping_path = 'character_image_mapping.json'

    if not os.path.exists(csv_path):
        print(f"CharName.csv not found")
        return 1

    mapping = {}
    if os.path.exists(mapping_path):
        try:
            with open(mapping_path, 'r', encoding='utf-8') as f:
                mapping = json.load(f)
        except Exception as e:
            print(f"Error reading mapping: {e}")

    existing = db.get_characters()
    if existing is not None and len(existing) > 0:
        print("Characters already in DB, skipping import. Delete 'characters' key to re-import.")
        return 0

    chars = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get('name', '')
            if not name:
                continue
            img = mapping.get(name, {}).get('filename', '')
            chars.append({
                'name': name,
                'series': row.get('series', ''),
                'rank': row.get('rank', ''),
                'main_image_url': img,
            })

    db._set_characters_raw(chars)
    print(f"Imported {len(chars)} characters into DB")
    return 0


if __name__ == '__main__':
    exit(main())
