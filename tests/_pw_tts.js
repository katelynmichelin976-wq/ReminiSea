const { chromium } = require("playwright");
const h = require("./_playwright_helper");
const { pass, section, wait, run, getCounts, getBaseUrl, openSettingsTab, closeSettings } = h;
const CFG = { url: getBaseUrl() + "?v=" + Date.now() };

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await h.startCoverage(page);
  let jsErrors = 0;
  page.on("pageerror", e => { jsErrors++; console.log("  [PAGE ERROR]", e.message); });

  try {
    await page.goto(CFG.url, { waitUntil: "networkidle", timeout: 30000 });
    await wait(page, 2000);
    await run(page, () => setLocale("zh-CN"));
    await wait(page, 300);

    // ════ PHASE 1: TTS 核心函数不抛异常 ════
    section("PHASE 1: TTS core — speak / speakSequence / speakOptHint / playVoiceSlot");
    const speakOk = await run(page, () => {
      try { if (typeof speak === "function") { speak("test"); return "ok"; } } catch(e) { return e.message; }
      return "no func";
    });
    pass("speak() ok", speakOk === "ok");

    const seqOk = await run(page, () => {
      try { if (typeof speakSequence === "function") { speakSequence([]); return "ok"; } } catch(e) { return e.message; }
      return "no func";
    });
    pass("speakSequence() ok", seqOk === "ok");

    const optHintOk = await run(page, () => {
      try { if (typeof speakOptHint === "function") { speakOptHint(["苹果","香蕉","椅子"], "zh-CN"); return "ok"; } } catch(e) { return e.message; }
      return "no func";
    });
    pass("speakOptHint() ok", optHintOk === "ok");

    const voiceSlotOk = await run(page, () => {
      try { if (typeof playVoiceSlot === "function") { playVoiceSlot("quiz_prompt", "哪个是正确的", "zh-CN"); return "ok"; } } catch(e) { return e.message; }
      return "no func";
    });
    pass("playVoiceSlot() ok", voiceSlotOk === "ok");

    // ════ PHASE 2: 浏览模式 / 翻转 ════
    section("PHASE 2: Browse / flip");
    const fnsB = ["startBrowse","_enterBrowse","_renderBrowseCard","browseNav","browseTTS","revealBrowse"];
    let okB = 0;
    for (const fn of fnsB) { const ex = await run(page, (f) => typeof window[f] === "function", fn); if (ex) okB++; }
    pass("6 browse fns (" + okB + "/6)", okB === 6);

    // ════ PHASE 3: onPhraseChange / onDelayChange 语音设置 ════
    section("PHASE 3: Voice phrase/delay settings");
    await openSettingsTab(page);
    await run(page, () => {
      const tabs = document.querySelectorAll(".sheet-tab");
      for (const t of tabs) { if (/语音|Voice/.test(t.textContent)) { t.click(); return; } }
    });
    await wait(page, 300);

    // 3a: answer read delay callback (covered in _pw_settings, but verify)
    const fnsV = ["onPhraseChange","onQpDelayChange","onOhDelayChange","onDelayChange","onBrowseDelayChange",
      "onOptReadDelayChange","onOptTouchDelayChange","onNdurChange","onBdurChange","toggleConfetti",
      "onTtsRateChange","onTtsPitchChange","onTtsVoiceChange","onVoiceMutedChange","onAnsReadDelayChange","onBrowseAnsDelayChange",
      "onFsChange","onLsChange","forceRefresh","updateVoiceAssistStatus"];
    let okV = 0;
    for (const fn of fnsV) {
      const ex = await run(page, (f) => typeof window[f] === "function", fn);
      if (ex) okV++;
    }
    pass("20 voice setting fns (" + okV + "/20)", okV >= 19);

    closeSettings(page);

    // ════ PHASE 4: 语音辅助屏幕 + recording UI ════
    section("PHASE 4: Voice assist screen (no mic)");
    const fnsR = ["openVoiceAssist","renderVoiceSlots","onSlotRowTap","toggleVaGroup",
      "onVoiceAssistToggle","openRecordingOverlay","closeRecordingOverlay","onRecScriptChange",
      "showTextEditOverlay","closeTextEditOverlay","saveTextEdit","_showRecState",
      "toggleRecording","_onRecordingStopped","_stopRecordingCleanup","playRecordedPreview",
      "resetRecording","saveVoiceRecording","saveVoiceSlot","loadVoiceSlot","deleteVoiceSlot","loadAllVoiceSlots"];
    let okR = 0;
    for (const fn of fnsR) {
      const ex = await run(page, (f) => typeof window[f] === "function", fn);
      if (ex) okR++;
    }
    pass("22 voice-assist fns (" + okR + "/22)", okR >= 21);

    // Open voice assist page and verify UI
    await run(page, () => { if (typeof openVoiceAssist === "function") openVoiceAssist(); });
    await wait(page, 500);
    const vaVisible = await run(page, () => document.getElementById("screen-voice-assist").classList.contains("active"));
    pass("openVoiceAssist → screen active", vaVisible);

    const vaToggle = await run(page, () => !!document.getElementById("va-enable-toggle"));
    pass("va-enable-toggle exists", vaToggle);

    await run(page, () => showScreen("screen-mine"));
    await wait(page, 200);

    pass("no JS errors", jsErrors === 0);

  } finally {
    const { passed, failed } = getCounts();
    section("result");
    console.log("  passed: " + passed + "  failed: " + failed + "  jsErrors: " + jsErrors);
    await h.stopAndCollectFromBrowser(browser, "_pw_tts");
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
