"""Append pending characters from pending_characters.json to CharName.csv.
Run: python add_to_csv.py [pending_characters.json]
If no file given, uses pending_characters.json in current directory."""
import csv
import json
import os
import sys

def main():
    json_path = sys.argv[1] if len(sys.argv) > 1 else 'pending_characters.json'
    if not os.path.exists(json_path):
        print(f'File not found: {json_path}')
        sys.exit(1)

    with open(json_path, 'r', encoding='utf-8') as f:
        pending = json.load(f)

    if not pending:
        print('No pending characters to add.')
        return

    csv_path = 'CharName.csv'
    if not os.path.exists(csv_path):
        print(f'CharName.csv not found in current directory.')
        sys.exit(1)

    # Read existing CSV to get max rank
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

    # Append new rows with auto-assigned ranks
    for p in pending:
        max_rank += 1
        rows.append({
            'rank': str(max_rank),
            'name': p.get('name', '').strip(),
            'series': p.get('series', '').strip(),
            'kakera': str(p.get('kakera', 0))
        })

    with open(csv_path, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Appended {len(pending)} character(s) to CharName.csv')
    for p in pending:
        print(f"  - {p.get('name')} ({p.get('series')})")

if __name__ == '__main__':
    main()
