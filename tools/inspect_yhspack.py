import zipfile, json, sys
sys.stdout.reconfigure(encoding="utf-8")
with zipfile.ZipFile("4000_essential_english_words_top10.yhspack", "r") as z:
    data = json.loads(z.read("deck.json").decode("utf-8"))
    cards = data["deck"]["cards"]
    print("=== 卡片数:", len(cards))
    c = cards[0]
    print("=== 第一张卡:", c["name"])
    for k, v in c.items():
        if k != "ext":
            print("  " + k + ": " + repr(v)[:80])
    print("  ext:")
    for k, v in c.get("ext", {}).items():
        print("    " + k + ": " + repr(v)[:120])
    print()
    print("=== image/audio 字段:")
    for card in cards:
        name = card["name"]
        img = card.get("image", "---")
        aud = card.get("audio", "---")
        print("  " + name + ": img=" + img + "  aud=" + aud)
    print()
    names = z.namelist()
    print("=== ZIP 内文件 (" + str(len(names)) + " 个):")
    for n in names[:20]:
        info = z.getinfo(n)
        print("  " + n + "  (" + str(info.file_size) + " bytes)")
