import zipfile, json, sys, os
sys.stdout.reconfigure(encoding="utf-8")

src = "4000_essential_english_words_full.yhspack"
dst = "4000_essential_english_words_200to300.yhspack"
START = 200
END   = 300  # exclusive → cards[200:300] = 100 cards (indices 200-299)

with zipfile.ZipFile(src, "r") as zin:
    data = json.loads(zin.read("deck.json").decode("utf-8"))
    all_cards = data["deck"]["cards"]
    print(f"原始卡片总数: {len(all_cards)}")

    sliced = all_cards[START:END]
    print(f"截取范围: [{START}, {END})，共 {len(sliced)} 张")

    # 收集本次用到的媒体文件名
    needed_media = set()
    for c in sliced:
        img = c.get("image", "")
        aud = c.get("audio", "")
        if img and img != "---":
            needed_media.add(img)
        if aud and aud != "---":
            needed_media.add(aud)
    print(f"涉及媒体文件: {len(needed_media)} 个")

    # 构建新 deck.json
    new_data = json.loads(json.dumps(data))  # deep copy
    new_data["deck"]["cards"] = sliced
    new_data["deck"]["name"] = new_data["deck"].get("name", "deck") + f"_cards{START+1}-{END}"
    new_json = json.dumps(new_data, ensure_ascii=False).encode("utf-8")

    # 写新 zip
    all_names = set(zin.namelist())
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("deck.json", new_json)
        for name in zin.namelist():
            if name == "deck.json":
                continue
            basename = os.path.basename(name)
            if basename in needed_media or not needed_media:
                zout.writestr(name, zin.read(name))
                print(f"  复制媒体: {name}")

print(f"\n已生成: {dst}")
print(f"文件大小: {os.path.getsize(dst):,} bytes")
