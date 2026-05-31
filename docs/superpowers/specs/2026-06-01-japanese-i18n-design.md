# 日本語（ja）UI サポート設計仕様

**日付：** 2026-06-01
**バージョン目標：** 次の minor バージョン
**ステータス：** 承認済み

---

## 背景

忆海拾光は現在 `en`、`zh-CN`、`zh-Hant`、`es` の 4 つの UI 言語をサポートしている。日本語話者（`ja`、`ja-JP`）はフォールバック `en` に当たるため、日本語 UI が提供されていない。本次新增 `ja` locale により、UI の日本語化と日本語カード内容の TTS 再生の両方を実現する。

---

## スコープ

- UI 言語に `ja` を追加（約 277 キー、Claude 生成）
- 言語選択ページに日本語行を追加
- `pickVoice` で ja-JP voice を正しく選択できるよう修正
- 関連するユニットテスト・Playwright smoke テストの更新

**対象外：**
- カードの `lang` フィールドへの新規値追加（既存の自由記述フィールドをそのまま利用）
- 日本語固有の SRS パラメータ変更

---

## アーキテクチャ設計

### 1. 定数・データ

**`SUPPORTED_LOCALES`** を更新：
```js
const SUPPORTED_LOCALES = ['en', 'zh-CN', 'zh-Hant', 'es', 'ja'];
```

**`FALLBACK_LOCALE`** は `'en'` のまま変更なし。

**`detectLocale` — 変更不要：**
`ja-JP` のプレフィックス `ja` は既存のプレフィックスマッチで `ja` locale に自動マッチする。zh-Hant のような明示的バリアントテーブルは不要。

**`I18N['ja']` 翻訳ブロック：**
約 277 キーの日本語訳を `'es'` ブロックの後に配置。自然な口語日本語スタイル（過度に書き言葉的な漢字体を避ける）。Claude が生成し、`en`/`zh-CN` との意味的整合性を確保する。

**`const names` マップ更新：**
```js
const names = {
  'zh-CN': '中文',
  'zh-Hant': '繁體中文',
  'en': 'English',
  'es': 'Español',
  'ja': '日本語'
};
```

---

### 2. 言語選択ページ UI

既存の `es` 行の後に日本語行を追加：

```html
<div class="lang-row" data-lang="ja" onclick="selectLang('ja')">
  <div class="lang-info">
    <div class="lang-name">日本語</div>
    <div class="lang-name-sub">Japanese</div>
  </div>
  <span class="lang-check">✓</span>
</div>
```

CSS 変更なし（既存 `.lang-row` スタイルを再利用）。

---

### 3. TTS / `pickVoice` 修正

**問題：** 現在の `pickVoice` は未知言語の最終フォールバックとして無条件に `zh-CN` voice を使用する。日本語コンテンツが中国語音声で読み上げられてしまう。

**修正：** `zh-CN` フォールバックを `prefix === 'zh'` の場合のみ有効にする：

```js
// 修正前（問題あり）
return voices.find(v => v.lang === want)
    || voices.find(v => v.lang && v.lang.split('-')[0] === prefix)
    || voices.find(v => v.lang === 'zh-CN')   // ja でも発動してしまう
    || (voices.length ? voices[0] : null);

// 修正後
return voices.find(v => v.lang === want)
    || voices.find(v => v.lang && v.lang.split('-')[0] === prefix)
    || (prefix === 'zh' ? voices.find(v => v.lang === 'zh-CN') : null)
    || (voices.length ? voices[0] : null);
```

**日本語 UI 時の voice 優先順位**（zh-Hant → zh-TW の類比）：

```js
if ((!lang || lang.startsWith('ja')) && getLocale() === 'ja') {
  return voices.find(v => v.lang === 'ja-JP')
      || voices.find(v => v.lang && v.lang.startsWith('ja'))
      || (voices.length ? voices[0] : null);
}
```

挿入位置：`pickVoice` 内の zh-Hant ブロックの直後。

**動作一覧：**

| UI locale | カード lang | TTS voice |
|-----------|-------------|-----------|
| ja | zh-CN（中文カード） | zh-CN / zh-TW（変更なし） |
| ja | ja（日本語カード） | ja-JP 優先 → ja-* → デバイス先頭 |
| zh-CN | ja | ja-JP 優先 → ja-* → デバイス先頭 |
| その他 | 任意 | 既存動作に変更なし |

---

### 4. エラーハンドリング

- `ja` 辞書に欠損キーがある場合、`t()` 関数が自動的に `'en'` にフォールバック（既存機構、変更不要）
- ja-JP voice が見つからない場合はデバイス先頭 voice にフォールバック（サイレント失敗なし）

---

## テスト計画

### ユニットテスト（`tests/yihai_v5.0_i18n_test.js`）

追加 case：
- `detectLocale('ja', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'ja'`
- `detectLocale('ja-JP', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'ja'`
- `detectLocale('zh-CN', SUPPORTED_LOCALES, FALLBACK_LOCALE)` → `'zh-CN'`（回帰）
- `ja` 辞書完整性：`en` ブロックの全キーが `ja` ブロックに存在すること

### Playwright UI Smoke（`tests/_pw_ui_smoke.js`）

追加 case：
- 言語選択ページに `[data-lang="ja"]` 要素が存在すること
- 日本語選択後、`screen-lang` タイトルが日本語文字を含むこと

---

## 実装ステップ概要

1. `SUPPORTED_LOCALES` に `'ja'` を追加
2. `I18N['ja']` 完整翻訳ブロックを生成・追加（`es` ブロックの後）
3. 言語選択ページに `ja` 行を追加
4. `const names` マップを更新
5. `pickVoice` の zh-CN フォールバック条件を修正
6. `pickVoice` に日本語 UI ブロックを追加
7. ユニットテストを更新
8. Playwright smoke テストを更新
9. `node tests/run_all.js` 全量通過
10. `node tests/_pw_ui_smoke.js` 通過
