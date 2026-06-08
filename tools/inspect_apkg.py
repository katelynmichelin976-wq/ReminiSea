#!/usr/bin/env python3
"""Quick inspector for any .apkg file"""
import sys, zipfile, sqlite3, json, io, os, tempfile
sys.stdout.reconfigure(encoding='utf-8')

APKG_PATH = sys.argv[1] if len(sys.argv) > 1 else r'C:\code\tests\test_data\家人.apkg'

ZSTD_MAGIC = bytes.fromhex('28b52ffd')

def decompress_zstd(data):
    import zstandard
    buf = io.BytesIO()
    zstandard.ZstdDecompressor().copy_stream(io.BytesIO(data), buf)
    return buf.getvalue()

def maybe_decompress(data):
    return decompress_zstd(data) if data[:4] == ZSTD_MAGIC else data

apkg = zipfile.ZipFile(APKG_PATH, 'r')
zip_names = set(apkg.namelist())
print('ZIP entries:', sorted(zip_names)[:30])

col_name = 'collection.anki21b' if 'collection.anki21b' in zip_names else 'collection.anki2'
col_data = maybe_decompress(apkg.read(col_name))
tmp = os.path.join(tempfile.gettempdir(), 'inspect_anki.db')
with open(tmp, 'wb') as f: f.write(col_data)

db = sqlite3.connect(tmp)
cur = db.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print('\nTables:', tables)

# notetypes
if 'notetypes' in tables:
    cur.execute('SELECT id, name FROM notetypes')
    for row in cur.fetchall():
        print(f'\nNotetype id={row[0]}  name={row[1]}')
        cur2 = db.cursor()
        cur2.execute('SELECT ord, name FROM fields WHERE ntid=? ORDER BY ord', (row[0],))
        for f in cur2.fetchall():
            print(f'  field[{f[0]}]: {f[1]}')
elif 'col' in tables:
    cur.execute('SELECT models FROM col LIMIT 1')
    models = json.loads(cur.fetchone()[0])
    for mid, m in models.items():
        print(f'\nNotetype id={mid}  name={m["name"]}')
        for f in sorted(m.get('flds',[]), key=lambda x: x['ord']):
            print(f'  field[{f["ord"]}]: {f["name"]}')

cur.execute('SELECT count(*) FROM notes')
print(f'\nTotal notes: {cur.fetchone()[0]}')

# sample first 3 notes
cur.execute('SELECT id, mid, flds FROM notes LIMIT 3')
for nid, mid, flds in cur.fetchall():
    parts = flds.split('\x1f')
    print(f'\nNote {nid} (mid={mid}):')
    for i, p in enumerate(parts):
        print(f'  [{i}] {p[:100]}')

db.close()
apkg.close()
