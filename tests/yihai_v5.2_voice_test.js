// tests/yihai_v5.2_voice_test.js
const assert = require('assert');

function makeStorage() {
  const store = {};
  return {
    getItem: k => store[k] !== undefined ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  };
}

function migrateVoiceSettings(ls) {
  if (ls.getItem('quizPromptOn') === '0') ls.removeItem('phraseSelect');
  if (ls.getItem('optHintOn')    === '0') ls.removeItem('phraseOptHint');
  if (ls.getItem('wrongHintOn')  === '0') ls.removeItem('phraseWrong');
  if (ls.getItem('correctHintOn')=== '0') ls.removeItem('phraseCorrect');
  const oldDelay = ls.getItem('delay');
  if (oldDelay && !ls.getItem('ansReadDelay')) ls.setItem('ansReadDelay', oldDelay);
  const oldOptDelay = ls.getItem('optHintDelay');
  if (oldOptDelay && !ls.getItem('optReadDelay')) ls.setItem('optReadDelay', oldOptDelay);
  ['quizPromptOn','optHintOn','wrongHintOn','correctHintOn','readHint',
   'quizPromptDelay','optHintDelay','delay','browseDelay'].forEach(k => ls.removeItem(k));
}

let passed = 0, failed = 0;
function check(desc, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    passed++;
  } catch(e) {
    failed++;
    console.log(`  ✗ ${desc}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Test 1: 旧 toggle=0 清空文案
{
  const ls = makeStorage();
  ls.setItem('quizPromptOn', '0');
  ls.setItem('phraseSelect', '请选择');
  ls.setItem('wrongHintOn', '0');
  ls.setItem('phraseWrong', '再试试');
  migrateVoiceSettings(ls);
  check('quizPromptOn=0 应清空 phraseSelect', ls.getItem('phraseSelect'), null);
  check('wrongHintOn=0 应清空 phraseWrong', ls.getItem('phraseWrong'), null);
}

// Test 2: 旧 toggle=1 保留文案
{
  const ls = makeStorage();
  ls.setItem('quizPromptOn', '1');
  ls.setItem('phraseSelect', '请选择答案');
  migrateVoiceSettings(ls);
  check('quizPromptOn=1 应保留 phraseSelect', ls.getItem('phraseSelect'), '请选择答案');
}

// Test 3: 旧 delay 迁移
{
  const ls = makeStorage();
  ls.setItem('delay', '1.5');
  ls.setItem('optHintDelay', '6');
  migrateVoiceSettings(ls);
  check('delay 应迁移至 ansReadDelay', ls.getItem('ansReadDelay'), '1.5');
  check('optHintDelay 应迁移至 optReadDelay', ls.getItem('optReadDelay'), '6');
  check('旧 key delay 应被删除', ls.getItem('delay'), null);
}

// Test 4: 已有新 key 时不覆盖
{
  const ls = makeStorage();
  ls.setItem('ansReadDelay', '2.0');
  ls.setItem('delay', '1.5');
  migrateVoiceSettings(ls);
  check('已有 ansReadDelay 不应被覆盖', ls.getItem('ansReadDelay'), '2.0');
}

console.log(`\n通过 ${passed} / 失败 ${failed}`);
if (failed > 0) process.exit(1);
