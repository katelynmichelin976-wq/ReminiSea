# 个人牌组媒体同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 本地导入的个人牌组（.yhspack）能同步结构和媒体文件到 Supabase，跨设备可下载使用，支持中断续传。

**Architecture:** `importYhspack` 导入时立即上传结构（`uploadDeckToCloud`）；用户点「同步」按钮后，在 `runSync` 完成后串联 `uploadPersonalDeckMedia`，逐卡将 IDB blob 上传到 Supabase Storage，上传成功后更新 `card._imgUrl`/`card._audUrl` 并持久化，下次同步自动跳过已上传的卡片（续传）。

**Tech Stack:** Supabase JS SDK（`_sb.storage.from('ReminiSea').upload`），IndexedDB（`loadMedia`），localStorage（`saveDeckCards`），Playwright（浏览器端 smoke 测试）

---

## 文件改动一览

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `tests/_pw_ui_smoke.js` | 修改 | 新增 `uploadPersonalDeckMedia` 函数存在性断言 |
| `yihai_v5.5.html` | 修改 | i18n 新增 `toast_media_synced`（5 处） |
| `yihai_v5.5.html` | 修改 | `importYhspack`：修复 meta，触发结构上传 |
| `yihai_v5.5.html` | 修改 | 新增 `uploadPersonalDeckMedia` 函数 |
| `yihai_v5.5.html` | 修改 | `doAccountLogin`：串联媒体上传 |
| `yihai_v5.5.html` | 修改 | `doAccountSync`：串联媒体上传 |

---

## Task 1：写 Playwright smoke 测试（先失败）

**Files:**
- Modify: `tests/_pw_ui_smoke.js:100-102`

- [ ] **Step 1：在 PHASE 7 函数存在性区块加断言**

找到 `tests/_pw_ui_smoke.js` 第 102 行：
```js
pass('runSync 函数存在', await run(page, () => typeof runSync === 'function'));
```
在其后插入：
```js
pass('uploadPersonalDeckMedia 函数存在', await run(page, () => typeof uploadPersonalDeckMedia === 'function'));
```

- [ ] **Step 2：确认 HTTP 服务器在运行**

在另一个终端确保已执行：
```powershell
python -m http.server 8080 --directory C:\code
```

- [ ] **Step 3：运行测试，确认新断言失败**

```powershell
node tests/_pw_ui_smoke.js
```

期望输出中出现：
```
✗ uploadPersonalDeckMedia 函数存在
```
（其他已有断言全部通过，只有这一条失败）

---

## Task 2：新增 i18n key `toast_media_synced`

**Files:**
- Modify: `yihai_v5.5.html`（5 处）

- [ ] **Step 1：en locale（约第 6156 行）**

找到：
```js
    toast_exporting: 'Exporting…',
```
改为：
```js
    toast_exporting: 'Exporting…',
    toast_media_synced: '✓ Media synced ({n} files)',
```

- [ ] **Step 2：zh-CN locale（约第 6439 行）**

找到：
```js
    toast_exporting: '正在导出…',
```
改为：
```js
    toast_exporting: '正在导出…',
    toast_media_synced: '✓ 媒体已同步（{n} 个文件）',
```

- [ ] **Step 3：zh-Hant locale（约第 6718 行）**

找到：
```js
    toast_exporting: '正在匯出…',
```
改为：
```js
    toast_exporting: '正在匯出…',
    toast_media_synced: '✓ 媒體已同步（{n} 個文件）',
```

- [ ] **Step 4：es locale（约第 6997 行）**

找到：
```js
    toast_exporting: 'Exportando…',
```
改为：
```js
    toast_exporting: 'Exportando…',
    toast_media_synced: '✓ Medios sincronizados ({n} archivos)',
```

- [ ] **Step 5：ja locale（约第 7284 行）**

找到：
```js
    toast_exporting: 'エクスポート中…',
```
改为：
```js
    toast_exporting: 'エクスポート中…',
    toast_media_synced: '✓ メディアを同期しました（{n} 件）',
```

---

## Task 3：修复 `importYhspack` meta + 触发结构上传

**Files:**
- Modify: `yihai_v5.5.html:4695-4702`

- [ ] **Step 1：替换 meta 写入逻辑**

找到（约 4696 行）：
```js
    // update or append meta
    const existing = DECKS_META.findIndex(m => m.key === key);
    if (existing >= 0) DECKS_META[existing] = { key, name, source: 'local' };
    else DECKS_META.push({ key, name, source: 'local' });

    // persist (id+name only, blob URL not stored)
    saveDeckIndex();
    saveDeckCards(key, cards);
```

替换为：
```js
    // update or append meta
    const existing = DECKS_META.findIndex(m => m.key === key);
    const deckLangVal = deckLang || 'zh-CN';
    if (existing >= 0) DECKS_META[existing] = { key, name, deck_type: 'personal', nameLang: deckLangVal };
    else DECKS_META.push({ key, name, deck_type: 'personal', nameLang: deckLangVal });

    // persist (id+name only, blob URL not stored)
    saveDeckIndex();
    saveDeckCards(key, cards);

    // upload structure to cloud (fire-and-forget; media deferred to next sync)
    uploadDeckToCloud(key).catch(() => {});
```

---

## Task 4：新增 `uploadPersonalDeckMedia` 函数

**Files:**
- Modify: `yihai_v5.5.html`（在 `uploadDeckToCloud` 函数之后插入）

- [ ] **Step 1：在 `uploadDeckToCloud` 结束括号后插入新函数**

找到（约 9362 行）：
```js
    console.warn('[cloud] uploadDeckToCloud fail:', e.message);
  }
}

async function checkPersonalDeckUpdates() {
```

替换为：
```js
    console.warn('[cloud] uploadDeckToCloud fail:', e.message);
  }
}

async function uploadPersonalDeckMedia(deckId) {
  if (!_syncEnabled || !_sb || !_cloudUserId) return;
  const meta = DECKS_META.find(m => m.key === deckId);
  if (!meta || meta.deck_type !== 'personal') return;
  const cards = DECKS[deckId];
  if (!cards || !cards.length) return;

  let uploaded = 0;
  await parallelMapLimit(cards, 3, async (c) => {
    let changed = false;

    if (!c._imgUrl) {
      const blob = await loadMedia(`${deckId}_${c.id}_img`).catch(() => null);
      if (blob) {
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        const path = `personal/${_cloudUserId}/${deckId}/${c.id}_img.${ext}`;
        const { error } = await _sb.storage.from('ReminiSea').upload(path, blob, { upsert: true });
        if (!error) { c._imgUrl = path; changed = true; }
        else console.warn('[cloud] media upload img fail:', c.id, error.message);
      }
    }

    if (!c._audUrl) {
      const blob = await loadMedia(`${deckId}_${c.id}_aud`).catch(() => null);
      if (blob) {
        const ext = blob.type === 'audio/mpeg' ? 'mp3' : 'm4a';
        const path = `personal/${_cloudUserId}/${deckId}/${c.id}_aud.${ext}`;
        const { error } = await _sb.storage.from('ReminiSea').upload(path, blob, { upsert: true });
        if (!error) { c._audUrl = path; changed = true; }
        else console.warn('[cloud] media upload aud fail:', c.id, error.message);
      }
    }

    if (changed) uploaded++;
  });

  if (uploaded > 0) {
    saveDeckCards(deckId, cards);
    await uploadDeckToCloud(deckId);
    showCloudToast(t('toast_media_synced', { n: uploaded }));
    console.log('[cloud] uploadPersonalDeckMedia ok:', deckId, uploaded, 'files');
  }
}

async function checkPersonalDeckUpdates() {
```

---

## Task 5：串联 `doAccountLogin` + `doAccountSync`

**Files:**
- Modify: `yihai_v5.5.html:5490`（doAccountLogin）
- Modify: `yihai_v5.5.html:5515-5517`（doAccountSync）

- [ ] **Step 1：修改 `doAccountLogin`（约 5490 行）**

找到：
```js
    runSync({ modal: true, decks: true, events: true, title: t('sync_syncing_data'), voice: true, deckKey: currentDeck }).catch(e => console.warn('[sync] login sync error:', e.message));
```

替换为：
```js
    runSync({ modal: true, decks: true, events: true, title: t('sync_syncing_data'), voice: true, deckKey: currentDeck })
      .then(() => { DECKS_META.filter(m => m.deck_type === 'personal').forEach(m => uploadDeckToCloud(m.key).then(() => uploadPersonalDeckMedia(m.key)).catch(() => {})); })
      .catch(e => console.warn('[sync] login sync error:', e.message));
```

- [ ] **Step 2：修改 `doAccountSync`（约 5515 行）**

找到：
```js
  runSync({ modal: true, decks: true, events: true, showToast: true, voice: true, deckKey: currentDeck })
    .catch(function(e){ console.warn('[sync] account sync error:', e.message); })
    .finally(function() { if (btn) btn.disabled = false; });
```

替换为：
```js
  runSync({ modal: true, decks: true, events: true, showToast: true, voice: true, deckKey: currentDeck })
    .then(function() { DECKS_META.filter(m => m.deck_type === 'personal').forEach(m => uploadDeckToCloud(m.key).then(() => uploadPersonalDeckMedia(m.key)).catch(() => {})); })
    .catch(function(e){ console.warn('[sync] account sync error:', e.message); })
    .finally(function() { if (btn) btn.disabled = false; });
```

---

## Task 6：验证 & 提交

**Files:**
- Run: `tests/_pw_ui_smoke.js`
- Run: `tests/run_all.js`

- [ ] **Step 1：运行 smoke 测试，确认 `uploadPersonalDeckMedia` 断言通过**

```powershell
node tests/_pw_ui_smoke.js
```

期望：
```
✓ uploadPersonalDeckMedia 函数存在
```
所有 65 个断言通过（原 64 + 新增 1）。

- [ ] **Step 2：运行单元测试，确认无回归**

```powershell
node tests/run_all.js
```

期望：
```
✓ 合计 6 套件，365 个断言，0 个失败
```

- [ ] **Step 3：提交**

```powershell
git add yihai_v5.5.html tests/_pw_ui_smoke.js
git commit -m "feat: 个人牌组媒体同步到 Supabase Storage，支持续传"
```
