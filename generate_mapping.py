"""Generate character_mapping.js from character_image_mapping.json and CharName.csv.
Run when you update the mapping. Enables search without a server (file://)."""
import csv
import json
import os

def main():
    mapping = {}
    if os.path.exists('character_image_mapping.json'):
        with open('character_image_mapping.json', 'r', encoding='utf-8') as f:
            mapping = json.load(f)

    csv_lookup = {}
    if os.path.exists('CharName.csv'):
        with open('CharName.csv', 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                csv_lookup[row['name']] = {'series': row.get('series', ''), 'rank': row.get('rank', '')}

    characters = [
        {
            'name': name,
            'image': data.get('filename', ''),
            'series': csv_lookup.get(name, {}).get('series', ''),
            'rank': csv_lookup.get(name, {}).get('rank', '')
        }
        for name, data in mapping.items()
    ]

    with open('character_mapping.js', 'w', encoding='utf-8') as f:
        f.write('// From character_image_mapping.json - run generate_mapping.py to update\n')
        f.write('window.CHARACTER_MAPPING = ')
        json.dump(mapping, f, ensure_ascii=False)
        f.write(';\nwindow.CHARACTERS_DATA = ')
        json.dump(characters, f, ensure_ascii=False)
        f.write(';\n')

    print(f'Generated character_mapping.js with {len(characters)} characters')

if __name__ == '__main__':
    main()
