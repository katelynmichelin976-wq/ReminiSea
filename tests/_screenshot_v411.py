"""截取 v4.11 各界面截图，用于 v5 设计参考"""
from playwright.sync_api import sync_playwright
import os, time

OUT = r"C:\code\tests\screenshots"
os.makedirs(OUT, exist_ok=True)

BASE = "http://localhost:8080/yihai_v4.11.html"

def shot(page, name):
    page.screenshot(path=f"{OUT}/{name}.png")
    print(f"  OK {name}.png")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 390, "height": 844})  # iPhone 14 尺寸
    page = ctx.new_page()

    # ── 1. 首页 ──────────────────────────────────────────────
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(800)
    shot(page, "01_home")

    # ── 2. 练习屏（选牌组→开始→截答题状态）──────────────────
    # 点第一个牌组
    deck = page.locator(".deck-card").first
    deck.click()
    page.wait_for_timeout(300)
    # 点「开始练习」
    page.locator(".start-btn").click()
    page.wait_for_timeout(1500)
    shot(page, "02_quiz_question")   # 出题状态

    # 选第一个选项
    opts = page.locator(".opt")
    if opts.count() > 0:
        opts.first.click()
        page.wait_for_timeout(400)
        shot(page, "03_quiz_after_select")  # 选完后（答案面板 + 下一题环）

    # 点「确认答案」
    sub = page.locator("#subbtn")
    if sub.is_visible():
        sub.click()
        page.wait_for_timeout(600)
        shot(page, "04_quiz_answer_panel")  # 答案面板展开 + 倒计时环

    # ── 3. 统计屏（4 个 Tab）────────────────────────────────
    # 返回首页（点 quiz 屏的 back-btn）
    page.locator("#screen-quiz .back-btn").click()
    page.wait_for_timeout(600)

    # 点统计图标（柱状图 SVG 按钮）
    page.locator("button[aria-label='统计']").click()
    page.wait_for_timeout(600)
    shot(page, "05_stats_tab0_today")

    page.locator(".stats-tab").nth(1).click()
    page.wait_for_timeout(400)
    shot(page, "06_stats_tab1_deck")

    page.locator(".stats-tab").nth(2).click()
    page.wait_for_timeout(400)
    shot(page, "07_stats_tab2_cards")

    page.locator(".stats-tab").nth(3).click()
    page.wait_for_timeout(400)
    shot(page, "08_stats_tab3_records")

    # ── 4. 设置抽屉各 Tab ───────────────────────────────────
    # 回首页（stats 屏有 back-btn）
    page.locator("#screen-stats .back-btn").click()
    page.wait_for_timeout(400)

    # 打开设置
    page.locator("button[aria-label='设置']").click()
    page.wait_for_timeout(500)

    # Tab 0: 通用（含练习模式）
    page.locator(".sheet-tab").nth(0).click()
    page.wait_for_timeout(300)
    shot(page, "09_settings_general")

    # 滚动到练习模式区域
    page.evaluate("document.querySelector('.settings-sheet').scrollTop = 600")
    page.wait_for_timeout(200)
    shot(page, "10_settings_general_session_mode")

    # Tab 1: 语音
    page.locator(".sheet-tab").nth(1).click()
    page.wait_for_timeout(300)
    shot(page, "11_settings_voice")

    # Tab 3: SRS（上）
    page.locator(".sheet-tab").nth(3).click()
    page.wait_for_timeout(300)
    shot(page, "12_settings_srs_top")

    page.evaluate("document.querySelector('.settings-sheet').scrollTop = 600")
    page.wait_for_timeout(200)
    shot(page, "13_settings_srs_bottom")

    # Tab 4: 云端 — 未登录态
    page.locator(".sheet-tab").nth(4).click()
    page.wait_for_timeout(300)
    shot(page, "14_settings_cloud_loggedout")

    # 登录
    email_input = page.locator("#cloud-email")
    pwd_input   = page.locator("#cloud-password")
    if email_input.is_visible():
        email_input.fill("zyhacl@gmail.com")
        pwd_input.fill("667788")
        page.locator("#cloud-login-btn").click()
        page.wait_for_timeout(4000)   # 等待登录完成
        shot(page, "15_settings_cloud_loggedin")

    browser.close()
    print(f"\n全部截图已保存至 {OUT}")
