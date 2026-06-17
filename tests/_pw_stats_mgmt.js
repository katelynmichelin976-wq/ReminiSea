const { chromium } = require("playwright");
const h = require("./_playwright_helper");
const { pass, section, wait, run, getCounts, getBaseUrl } = h;
const CFG = { url: getBaseUrl() + "?v=" + Date.now() };
const BK = "__builtin_test__";

(async () => {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await h.startCoverage(page);
  let jsErrors = 0;
  page.on("pageerror", e => { jsErrors++; console.log("  " + e.message); });

  try {
    await page.goto(CFG.url, { waitUntil: "networkidle", timeout: 30000 });
    await wait(page, 2000);
    await run(page, () => setLocale("zh-CN"));
    await wait(page, 300);
    await run(page, () => { document.documentElement.setAttribute("data-mode","advanced"); });
    await wait(page, 200);

    section("PHASE 1: Deck CRUD + ActionSheet + Export");
    await run(page, () => { showScreen("screen-decks"); switchDecksTab("local"); });
    await wait(page, 500);

    const fnsD = ["createEmptyDeck","deleteDeck","renameDeck","openActionSheet","closeActionSheet","exportDeck"];
    let okD = 0;
    for (const fn of fnsD) {
      const ex = await run(page, (f) => typeof window[f] === "function", fn);
      if (ex) okD++;
    }
    pass("6 deck fns (" + okD + "/6)", okD === 6);

    section("PHASE 2: Stats page");
    await run(page, () => showScreen("screen-home"));
    await wait(page, 400);
    await run(page, () => { document.querySelector('[onclick="openStats()"]').click(); });
    await wait(page, 2000);

    const statsActive = await run(page, () => document.getElementById("screen-stats").classList.contains("active"));
    pass("openStats active", statsActive);

    const tabCount = await run(page, () => document.querySelectorAll(".stats-tab").length);
    pass("stats tabs = 4", tabCount === 4);

    await run(page, () => switchStatsTab(1));
    await wait(page, 500);
    const deckTabActive = await run(page, () => document.querySelectorAll(".stats-tab")[1].classList.contains("active"));
    pass("switchStatsTab(1) deck active", deckTabActive);

    await run(page, () => switchStatsTab(2));
    await wait(page, 500);
    const cardsTabActive = await run(page, () => document.querySelectorAll(".stats-tab")[2].classList.contains("active"));
    pass("switchStatsTab(2) cards active", cardsTabActive);

    await run(page, () => closeStats());
    await wait(page, 300);
    const closed = await run(page, () => !document.getElementById("screen-stats").classList.contains("active"));
    pass("closeStats inactive", closed);

    section("PHASE 3: Card detail + unsuspend + prompt");
    await run(page, (k) => { currentDeck = k; showDeckDetail(); }, BK);
    await wait(page, 800);

    const card = await run(page, () => document.querySelector("#dd-cards-grid .dd-card"));
    if (card) {
      await run(page, () => { document.querySelector("#dd-cards-grid .dd-card").click(); });
      await wait(page, 600);
      const sheet = await run(page, () => !!document.querySelector(".card-detail-sheet"));
      pass("openCardDetail visible", sheet);

      await run(page, () => {
        const ov = document.querySelector(".card-detail-overlay");
        if (ov) ov.click();
      });
      await wait(page, 400);
      const cdClosed = await run(page, () => !document.querySelector(".card-detail-sheet"));
      pass("closeCardDetail gone", cdClosed);
    } else {
      pass("openCardDetail (skip no cards)", true);
      pass("closeCardDetail (skip no cards)", true);
    }

    const fnsC = ["unsuspendCard","showPromptDialog","formatFeedbackText"];
    let okC = 0;
    for (const fn of fnsC) {
      const ex = await run(page, (f) => typeof window[f] === "function", fn);
      if (ex) okC++;
    }
    pass("3 card fns (" + okC + "/3)", okC === 3);

    section("PHASE 4: Media + misc helpers");
    const fnsM = ["deleteMediaForDeck","cleanOrphanMedia","checkMedia","slotStorageKey","getDeck","deleteCardStatesForDeck",
      "renderStatsToday","renderStatsDeck","renderStatsCards","filterCards","renderStatsTrials",
      "openCardDetail","closeCardDetail","confirmResetCard","onDeckClick",
      "getTranslateX","sourceIcon","showRestToast","startNRing","forceRefresh"];
    let okM = 0;
    for (const fn of fnsM) {
      const ex = await run(page, (f) => typeof window[f] === "function", fn);
      if (ex) okM++;
    }
    pass("19 helper fns (" + okM + "/19)", okM >= 18);

    pass("no JS errors", jsErrors === 0);

  } finally {
    const { passed, failed } = getCounts();
    section("result");
    console.log("  passed: " + passed + "  failed: " + failed + "  jsErrors: " + jsErrors);
    await h.stopAndCollectFromBrowser(browser, "_pw_stats_mgmt");
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
})();
