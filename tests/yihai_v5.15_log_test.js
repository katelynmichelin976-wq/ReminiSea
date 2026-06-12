// tests/yihai_v5.15_log_test.js
// 本地日志 ring buffer 单测（与 index.html 保持同步）

let passed = 0, failed = 0;
function check(desc, ok) {
  if (ok) passed++;
  else { failed++; console.log(`  ✗ ${desc}`); }
}

// ── LOCAL_LOG ring buffer ────────────────────────────────────────
const LOCAL_LOG_MAX = 2000;

function makeBuffer() {
  const buf = [];
  function push(level, module, event, data) {
    if (buf.length >= LOCAL_LOG_MAX) buf.shift();
    buf.push({ t: Date.now(), lv: level, m: module, e: event, d: data });
  }
  return { buf, push };
}

// 单条 push 形状正确
{
  const { buf, push } = makeBuffer();
  push('info', 'voice', 'tts_speak', { text: '太棒' });
  check('push 1 条后长度=1', buf.length === 1);
  const r = buf[0];
  check('entry 含 t/lv/m/e/d 字段', typeof r.t === 'number' && r.lv === 'info' && r.m === 'voice' && r.e === 'tts_speak' && r.d.text === '太棒');
}

// 多次 push 累积
{
  const { buf, push } = makeBuffer();
  for (let i = 0; i < 10; i++) push('info', 'sync', 'tick', { i });
  check('push 10 条后长度=10', buf.length === 10);
  check('保留顺序：第1条 i=0', buf[0].d.i === 0);
  check('保留顺序：最后1条 i=9', buf[9].d.i === 9);
}

// 满容量后 ring 行为：挤掉最旧
{
  const { buf, push } = makeBuffer();
  for (let i = 0; i < LOCAL_LOG_MAX + 5; i++) push('info', 'srs', 'tick', { i });
  check('超过 MAX 时长度恰好等于 MAX', buf.length === LOCAL_LOG_MAX);
  check('最旧的被挤掉：首条 i=5', buf[0].d.i === 5);
  check('最新保留：末条 i=MAX+4', buf[buf.length - 1].d.i === LOCAL_LOG_MAX + 4);
}

// level 字段保留
{
  const { buf, push } = makeBuffer();
  push('error', 'idb', 'tx_fail');
  push('warn',  'sync', 'retry');
  push('info',  'voice', 'tts_speak');
  check('error 级别记录', buf[0].lv === 'error');
  check('warn 级别记录',  buf[1].lv === 'warn');
  check('info 级别记录',  buf[2].lv === 'info');
}

// data 可省略
{
  const { buf, push } = makeBuffer();
  push('info', 'ui', 'go_home');
  check('data 省略时 d=undefined', buf[0].d === undefined);
}

console.log(`  ${passed} passed, ${failed} failed`);
module.exports = { passed, failed };
