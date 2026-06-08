#!/usr/bin/env python3
"""Convert 家人.apkg to 家人.yhspack"""
import sys, zipfile, sqlite3, json, re, io, uuid, os, tempfile
sys.stdout.reconfigure(encoding='utf-8')

APKG_PATH  = r'C:\code\tests\test_data\家人.apkg'
OUTPUT_PATH = r'C:\code\家人.yhspack'

ZSTD_MAGIC = bytes.fromhex('28b52ffd')

def maybe_decompress(data):
    if data[:4] == ZSTD_MAGIC:
        import zstandard
        buf = io.BytesIO()
        zstandard.ZstdDecompressor().copy_stream(io.BytesIO(data), buf)
        return buf.getvalue()
    return data

def parse_img_filename(s):
    m = re.search(r'<img[^>]+src=["\']?([^"\'>\s]+)', s, re.IGNORECASE)
    return m.group(1) if m else None

def parse_sound_filename(s):
    m = re.search(r'\[sound:([^\]]+)\]', s)
    return m.group(1) if m else None

def main():
    apkg = zipfile.ZipFile(APKG_PATH, 'r')
    zip_names = set(apkg.namelist())

    # load SQLite (old format)
    col_data = apkg.read('collection.anki2')
    tmp = os.path.join(tempfile.gettempdir(), 'jiaren_convert.db')
    with open(tmp, 'wb') as f: f.write(col_data)
    db = sqlite3.connect(tmp)
    cur = db.cursor()

    # field names: Front(0), Name(1), Audio(2), Seq(3)
    cur.execute('SELECT id, flds FROM notes ORDER BY id')
    notes = cur.fetchall()
    db.close()
    print(f'loaded {len(notes)} notes')

    # media map: {"0": "img_xxx.jpg", "1": "snd_xxx.m4a", ...} → invert
    media_raw = apkg.read('media')
    media_obj = json.loads(media_raw.decode('utf-8'))
    media_map = {v: k for k, v in media_obj.items()}  # filename → zip entry
    print(f'media entries: {len(media_map)}')

    deck_id = str(uuid.uuid4())
    cards = []
    media_files = {}

    for note_id, flds_raw in notes:
        fields = flds_raw.split('\x1f')
        # Front=0, Name=1, Audio=2, Seq=3
        front_html = fields[0] if len(fields) > 0 else ''
        name       = fields[1].strip() if len(fields) > 1 else ''
        audio_html = fields[2] if len(fields) > 2 else ''
        seq        = fields[3].strip() if len(fields) > 3 else ''

        if not name:
            print(f'  SKIP note {note_id}: empty name'); continue

        card_id = str(note_id)
        entry = {
            'id':       card_id,
            'name':     name,
            'nameLang': 'zh-CN',
            'cardType': 'choice',
            'details':  [],
            'ext':      {},
        }
        if seq:
            entry['ext']['seq'] = seq

        # image
        img_fname = parse_img_filename(front_html)
        if img_fname:
            zip_key = media_map.get(img_fname)
            if zip_key and zip_key in zip_names:
                try:
                    img_data = maybe_decompress(apkg.read(zip_key))
                    ext = img_fname.rsplit('.', 1)[-1].lower()
                    yhs_img = f'{card_id}.{ext}'
                    media_files[yhs_img] = img_data
                    entry['image'] = yhs_img
                except Exception as e:
                    print(f'  WARN: image failed for {name}: {e}')
            else:
                print(f'  WARN: image not found in zip for {name}: {img_fname}')

        # audio
        snd_fname = parse_sound_filename(audio_html)
        if snd_fname:
            zip_key = media_map.get(snd_fname)
            if zip_key and zip_key in zip_names:
                try:
                    aud_data = maybe_decompress(apkg.read(zip_key))
                    ext = snd_fname.rsplit('.', 1)[-1].lower()
                    yhs_aud = f'{card_id}.{ext}'
                    media_files[yhs_aud] = aud_data
                    entry['audio'] = yhs_aud
                except Exception as e:
                    print(f'  WARN: audio failed for {name}: {e}')
            else:
                print(f'  WARN: audio not found in zip for {name}: {snd_fname}')

        cards.append(entry)
        img_ok = 'img' if 'image' in entry else '---'
        aud_ok = 'aud' if 'audio' in entry else '---'
        print(f'  {img_ok} {aud_ok}  [{seq}] {name}')

    apkg.close()

    if not cards:
        print('ERROR: no cards'); return

    deck_json = json.dumps({
        'deck': {
            'id':       deck_id,
            'name':     '家人',
            'language': 'zh-CN',
            'cards':    cards,
        }
    }, ensure_ascii=False, indent=2)

    with zipfile.ZipFile(OUTPUT_PATH, 'w', zipfile.ZIP_DEFLATED) as zout:
        zout.writestr('deck.json', deck_json.encode('utf-8'))
        for fname, data in media_files.items():
            zout.writestr(fname, data)

    size_kb = os.path.getsize(OUTPUT_PATH) / 1024
    print(f'\nDone! {len(cards)} cards · {len(media_files)} media files · {size_kb:.1f} KB')
    print(f'Output: {OUTPUT_PATH}')

if __name__ == '__main__':
    main()
