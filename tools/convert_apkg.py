#!/usr/bin/env python3
"""
Convert Anki .apkg to .yhspack  (developer tool)

Usage:
  python convert_apkg.py [max_cards]
    max_cards: cards to convert (default 10, 0 = all)

Supports:
  - New format: collection.anki21b (Anki ≥2.1.28, Rust backend, zstd-compressed)
  - Old format: collection.anki2  (Anki ≤2.1.27, plain SQLite)

Requires: pip install zstandard
"""
import sys, zipfile, sqlite3, json, re, io, uuid, os, tempfile
sys.stdout.reconfigure(encoding='utf-8')

APKG_PATH  = r'C:\code\4000 Essential English Words.apkg'
OUTPUT_DIR = r'C:\code'

ZSTD_MAGIC = bytes.fromhex('28b52ffd')

# ─── decompression ───────────────────────────────────────────────────────────

def decompress_zstd(data):
    import zstandard
    buf = io.BytesIO()
    zstandard.ZstdDecompressor().copy_stream(io.BytesIO(data), buf)
    return buf.getvalue()

def maybe_decompress(data):
    """Decompress zstd if magic header present, otherwise return as-is."""
    return decompress_zstd(data) if data[:4] == ZSTD_MAGIC else data

# ─── text cleaning ───────────────────────────────────────────────────────────

def clean_field(s):
    """Strip Anki special syntax and HTML from a field used as display text.

    Rules (doc §3.3):
      1. Remove [sound:...] entirely (not just the tag)
      2. Remove <img src="..."> entirely
      3. Strip remaining HTML tags
      4. Normalize whitespace
    """
    s = re.sub(r'\[sound:[^\]]*\]', '', s)                 # [sound:x.mp3] → ''
    s = re.sub(r'<img[^>]+>', '', s, flags=re.IGNORECASE)  # <img ...> → ''
    s = re.sub(r'<[^>]+>', ' ', s)                         # other HTML tags → space
    return re.sub(r'\s+', ' ', s).strip()

def extract_pos(chinese_html):
    """Extract part-of-speech label from Bing dictionary HTML.
    e.g. <span class="pos">v.</span> → 'v.'
    Returns empty string if not found.
    """
    m = re.search(r'<span[^>]+class=["\']pos["\'][^>]*>([^<]+)</span>', chinese_html)
    return m.group(1).strip() if m else ''

def parse_img_filename(s):
    m = re.search(r'<img[^>]+src=["\']?([^"\'>\s]+)', s, re.IGNORECASE)
    return m.group(1) if m else None

def parse_sound_filename(s):
    m = re.search(r'\[sound:([^\]]+)\]', s)
    return m.group(1) if m else None

# ─── SQLite helpers (old + new format) ───────────────────────────────────────

def load_field_map(cur):
    """Return {note_type_id: [field_name, ...]} for all note types.
    Handles both new format (notetypes+fields tables) and old format (col.models JSON).
    """
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {r[0] for r in cur.fetchall()}

    if 'notetypes' in tables and 'fields' in tables:
        # New format (Anki ≥2.1.28)
        cur.execute('SELECT id, name FROM notetypes')
        notetypes = {r[0]: r[1] for r in cur.fetchall()}
        cur.execute('SELECT ntid, ord, name FROM fields ORDER BY ntid, ord')
        field_map = {}
        for ntid, _, fname in cur.fetchall():
            field_map.setdefault(ntid, []).append(fname)
        return notetypes, field_map
    elif 'col' in tables:
        # Old format (Anki ≤2.1.27): models embedded in col.models JSON
        cur.execute('SELECT models FROM col LIMIT 1')
        row = cur.fetchone()
        if not row:
            return {}, {}
        models = json.loads(row[0])
        notetypes = {int(mid): m['name'] for mid, m in models.items()}
        field_map = {
            int(mid): [f['name'] for f in sorted(m.get('flds', []), key=lambda f: f['ord'])]
            for mid, m in models.items()
        }
        return notetypes, field_map
    else:
        return {}, {}

# ─── media mapping ───────────────────────────────────────────────────────────

def parse_media_mapping(raw):
    """Parse Anki media manifest → {original_filename: zip_entry_name}.

    Old format: plain JSON {"0": "file.mp3", ...}  → invert to {filename: "0"}
    New format: zstd-compressed protobuf (already decompressed by caller).
      Structure: repeated { string name=1; uint32 internal_id=2; bytes sha1=3; }
      ZIP entry names are sequential order indices (0,1,2,...), NOT internal_id.
    """
    if not raw:
        return {}
    if raw[0:1] in (b'{', b'['):
        obj = json.loads(raw.decode('utf-8'))
        return {v: k for k, v in obj.items()}

    def read_varint(data, pos, end):
        r = 0; s = 0
        while pos < end:
            b = data[pos]; pos += 1
            r |= (b & 0x7F) << s
            if not (b & 0x80): break
            s += 7
        return r, pos

    mapping = {}
    n = len(raw); pos = 0; order = 0
    while pos < n:
        tag, pos = read_varint(raw, pos, n)
        wt = tag & 7
        if wt == 0:
            _, pos = read_varint(raw, pos, n)
        elif wt == 1:
            pos += 8
        elif wt == 2:
            length, pos = read_varint(raw, pos, n)
            entry = raw[pos:pos+length]; pos += length
            en = len(entry); name = None; ep = 0
            while ep < en:
                ftag, ep = read_varint(entry, ep, en)
                fw = ftag & 7; ffn = ftag >> 3
                if fw == 0:
                    _, ep = read_varint(entry, ep, en)
                elif fw == 1:
                    ep += 8
                elif fw == 2:
                    fl, ep = read_varint(entry, ep, en)
                    fd = entry[ep:ep+fl]; ep += fl
                    if ffn == 1: name = fd.decode('utf-8', 'replace')
                elif fw == 5:
                    ep += 4
                else:
                    break
            if name:
                mapping[name] = str(order)
            order += 1
        elif wt == 5:
            pos += 4
        else:
            break
    return mapping

# ─── main ────────────────────────────────────────────────────────────────────

def main():
    max_cards = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    if max_cards == 0:
        max_cards = None

    print(f'[convert_apkg] input : {APKG_PATH}')
    print(f'[convert_apkg] limit : {"all" if max_cards is None else max_cards} cards')

    # ── open ZIP ───────────────────────────────────────────────────────────
    try:
        apkg = zipfile.ZipFile(APKG_PATH, 'r')
    except (zipfile.BadZipFile, FileNotFoundError) as e:
        print(f'ERROR: 文件格式不正确，请选择 .apkg 文件（{e}）'); return
    zip_names = set(apkg.namelist())

    with apkg:
        # ── 1. load SQLite ─────────────────────────────────────────────
        if 'collection.anki21b' in zip_names:
            col_name = 'collection.anki21b'
        elif 'collection.anki2' in zip_names:
            col_name = 'collection.anki2'
        else:
            print('ERROR: 不支持的 Anki 版本（未找到 collection 文件）'); return

        print(f'[1/4] reading {col_name}...')
        col_data = apkg.read(col_name)
        col_data = maybe_decompress(col_data)

        tmp_db = os.path.join(tempfile.gettempdir(), 'anki_convert.db')
        with open(tmp_db, 'wb') as f: f.write(col_data)

        db = sqlite3.connect(tmp_db)
        cur = db.cursor()
        notetypes, field_map = load_field_map(cur)

        # Find target note type (4000 EEW)
        target_mid = None
        for mid, mname in notetypes.items():
            if '4000' in mname or 'EEW' in mname:
                target_mid = mid; break
        if not target_mid:
            print('ERROR: 未找到 4000 EEW note type'); db.close(); return

        fnames = field_map[target_mid]
        fi = {name: i for i, name in enumerate(fnames)}
        print(f'       note type : {notetypes[target_mid]}')
        print(f'       fields    : {fnames}')

        limit_clause = f'LIMIT {max_cards}' if max_cards else ''
        cur.execute(
            f'SELECT id, flds FROM notes WHERE mid=? ORDER BY id {limit_clause}',
            (target_mid,)
        )
        notes = cur.fetchall()
        db.close()
        print(f'       loaded {len(notes)} notes')

        # ── 2. parse media mapping ─────────────────────────────────────
        print('[2/4] parsing media mapping...')
        media_raw = maybe_decompress(apkg.read('media'))
        media_map = parse_media_mapping(media_raw)
        print(f'       {len(media_map)} entries')

        # ── 3. build cards ─────────────────────────────────────────────
        print('[3/4] building cards...')
        deck_id   = str(uuid.uuid4())
        deck_name = '4000 Essential English Words'
        deck_lang = 'en'
        cards = []
        media_files = {}   # yhspack filename → bytes
        skipped = 0

        def get_field(fields, name):
            i = fi.get(name, -1)
            return fields[i] if 0 <= i < len(fields) else ''

        for note_id, flds_raw in notes:
            fields = flds_raw.split('\x1f')

            # name: strip HTML per doc §3.3 (Word field rarely has HTML but apply rule)
            word = clean_field(get_field(fields, 'Word'))
            if not word:
                skipped += 1; continue

            card_id = str(note_id)

            # ext sub-fields for flip card back face  (doc §2.2 / §3.1)
            chinese_raw  = get_field(fields, 'chinese')
            ext = {}
            ipa = clean_field(get_field(fields, 'IPA'))
            if ipa:                            ext['phonetic']    = ipa
            pos = extract_pos(chinese_raw)
            if pos:                            ext['partOfSpeech'] = pos
            definition = clean_field(chinese_raw)
            if definition:                     ext['definition']   = definition
            en_def = clean_field(get_field(fields, 'Meaning'))
            if en_def:                         ext['enDefinition'] = en_def
            example = clean_field(get_field(fields, 'Example'))
            if example:                        ext['example']      = example

            entry = {
                'id':       card_id,
                'name':     word,
                'nameLang': deck_lang,   # doc §2.2: derived from deck.language
                'cardType': 'flip',      # doc §2.3: Anki decks use flip
                'details':  [],          # unused for flip cards
                'ext':      ext,
            }

            # image: parse <img src="..."> → resolve via media_map → maybe_decompress
            img_fname = parse_img_filename(get_field(fields, 'Image'))
            if img_fname:
                zip_key = media_map.get(img_fname)
                if zip_key and zip_key in zip_names:
                    try:
                        img_data = maybe_decompress(apkg.read(zip_key))
                        ext = img_fname.rsplit('.', 1)[-1].lower()
                        yhspack_img = f'{card_id}.{ext}'
                        media_files[yhspack_img] = img_data
                        entry['image'] = yhspack_img
                    except Exception as e:
                        print(f'       WARN: image skipped for {word}: {e}')

            # audio: parse [sound:...] → resolve via media_map
            snd_fname = parse_sound_filename(get_field(fields, 'Sound'))
            if snd_fname:
                zip_key = media_map.get(snd_fname)
                if zip_key and zip_key in zip_names:
                    try:
                        aud_data = maybe_decompress(apkg.read(zip_key))
                        ext = snd_fname.rsplit('.', 1)[-1].lower()
                        yhspack_aud = f'{card_id}.{ext}'
                        media_files[yhspack_aud] = aud_data
                        entry['audio'] = yhspack_aud
                    except Exception as e:
                        print(f'       WARN: audio skipped for {word}: {e}')

            cards.append(entry)
            img_ok = 'img' if 'image' in entry else '---'
            aud_ok = 'aud' if 'audio' in entry else '---'
            print(f'       {img_ok} {aud_ok}  {word}')

        if skipped:
            print(f'       skipped {skipped} notes with empty name field')

        # doc §5: zero cards → error
        if not cards:
            print('ERROR: 未找到有效卡片，请检查字段映射'); return

        # ── 4. write .yhspack ──────────────────────────────────────────
        suffix = f'_top{len(cards)}' if max_cards else '_full'
        out_name = f'4000_essential_english_words{suffix}.yhspack'
        out_path = os.path.join(OUTPUT_DIR, out_name)

        print(f'[4/4] writing {out_path}...')
        deck_json = json.dumps({
            'deck': {
                'id':       deck_id,
                'name':     deck_name,
                'language': deck_lang,
                'cards':    cards,
            }
        }, ensure_ascii=False, indent=2)

        with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_DEFLATED) as zout:
            zout.writestr('deck.json', deck_json.encode('utf-8'))
            for fname, data in media_files.items():
                zout.writestr(fname, data)

    size_kb = os.path.getsize(out_path) / 1024
    print(f'\nDone! {len(cards)} cards · {len(media_files)} media files · {size_kb:.1f} KB')
    print(f'File: {out_path}')

if __name__ == '__main__':
    main()
