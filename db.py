"""
Database layer for user data. Uses PostgreSQL when DATABASE_URL is set,
falls back to JSON files for local development and App Platform without a DB.
"""
import os
import json
import threading

_db = None
_db_lock = threading.Lock()

# JSON file paths (fallback when no DATABASE_URL)
CUSTOM_IMAGES_FILE = 'custom_images.json'
SAVED_CHARACTERS_FILE = 'saved_characters.json'
LAST_UPDATED_FILE = 'last_updated.json'
CHARACTERS_FILE = 'characters.json'


def _get_db():
    """Get database connection. Uses PostgreSQL if DATABASE_URL is set."""
    global _db
    with _db_lock:
        if _db is not None:
            return _db
        url = os.environ.get('DATABASE_URL')
        if url:
            try:
                import psycopg2
                if url.startswith('postgres://'):
                    url = 'postgresql://' + url[11:]
                conn = psycopg2.connect(url)
                conn.autocommit = True
                _db = ('postgres', conn)
                _init_postgres(conn)
                return _db
            except Exception as e:
                print(f"[DB] PostgreSQL init failed: {e}, falling back to JSON files", flush=True)
        _db = ('json', None)
        return _db


def _init_postgres(conn):
    """Create kv_store table if it doesn't exist."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value JSONB NOT NULL
            )
        """)


def _get_json(key, default):
    """Read from JSON file."""
    files = {
        'custom_images': CUSTOM_IMAGES_FILE,
        'saved_characters': SAVED_CHARACTERS_FILE,
        'last_updated': LAST_UPDATED_FILE,
        'characters': CHARACTERS_FILE,
    }
    path = files.get(key)
    if not path or not os.path.exists(path):
        return default
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def _set_json(key, value):
    """Write to JSON file."""
    files = {
        'custom_images': CUSTOM_IMAGES_FILE,
        'saved_characters': SAVED_CHARACTERS_FILE,
        'last_updated': LAST_UPDATED_FILE,
        'characters': CHARACTERS_FILE,
    }
    path = files.get(key)
    if path:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(value, f, indent=4, ensure_ascii=False)


def _get_pg(conn, key, default):
    """Read from PostgreSQL."""
    with conn.cursor() as cur:
        cur.execute("SELECT value FROM kv_store WHERE key = %s", (key,))
        row = cur.fetchone()
        return row[0] if row else default


def _set_pg(conn, key, value):
    """Write to PostgreSQL."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO kv_store (key, value) VALUES (%s, %s) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
            (key, json.dumps(value))
        )


def get_custom_images():
    """Get {char_name: [url1, url2, ...]}."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        return _get_pg(conn, 'custom_images', {})
    return _get_json('custom_images', {})


def set_custom_images(data):
    """Save custom_images."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        _set_pg(conn, 'custom_images', data)
    else:
        _set_json('custom_images', data)


def get_saved_characters():
    """Get list of saved character objects."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        return _get_pg(conn, 'saved_characters', [])
    return _get_json('saved_characters', [])


def set_saved_characters(data):
    """Save saved_characters."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        _set_pg(conn, 'saved_characters', data)
    else:
        _set_json('saved_characters', data)


def get_last_updated():
    """Get {char_name: timestamp, ...}."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        return _get_pg(conn, 'last_updated', {})
    return _get_json('last_updated', {})


def set_last_updated(data):
    """Save last_updated."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        _set_pg(conn, 'last_updated', data)
    else:
        _set_json('last_updated', data)


def update_last_modified(char_name):
    """Update timestamp for a character."""
    import time
    data = get_last_updated()
    data[char_name] = time.time()
    set_last_updated(data)


# --- Characters (name, series, rank, main_image_url) ---

def get_characters():
    """Get list of characters as [{name, series, rank, image}, ...] for API."""
    db_type, conn = _get_db()
    raw = _get_pg(conn, 'characters', None) if db_type == 'postgres' else _get_json('characters', None)
    if raw is None:
        return None  # Not yet migrated
    chars = raw if isinstance(raw, list) else []
    return [{'name': c['name'], 'series': c.get('series', ''), 'rank': c.get('rank', ''), 'image': c.get('main_image_url', '')} for c in chars]


def _get_characters_raw():
    """Get raw character list (internal)."""
    db_type, conn = _get_db()
    raw = _get_pg(conn, 'characters', []) if db_type == 'postgres' else _get_json('characters', [])
    return raw if isinstance(raw, list) else []


def _set_characters_raw(chars):
    """Save raw character list (internal)."""
    db_type, conn = _get_db()
    if db_type == 'postgres':
        _set_pg(conn, 'characters', chars)
    else:
        _set_json('characters', chars)


def add_character(name, series, rank, main_image_url=''):
    """Add a character. Returns False if name already exists."""
    chars = _get_characters_raw()
    if any(c.get('name') == name for c in chars):
        return False
    chars.append({'name': name, 'series': series, 'rank': rank, 'main_image_url': main_image_url})
    _set_characters_raw(chars)
    return True


def update_character(orig_name, new_name, series, rank):
    """Update character. Returns False if orig_name not found."""
    chars = _get_characters_raw()
    for c in chars:
        if c.get('name') == orig_name:
            c['name'] = new_name
            c['series'] = series
            c['rank'] = rank
            _set_characters_raw(chars)
            return True
    return False


def set_main_image(char_name, image_url):
    """Set main image for character. Returns False if not found."""
    chars = _get_characters_raw()
    for c in chars:
        if c.get('name') == char_name:
            c['main_image_url'] = image_url
            _set_characters_raw(chars)
            return True
    return False
