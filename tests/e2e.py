#!/usr/bin/env python3
"""브라우저 통짜 검사(헤드리스 크롬): 시작 → 여러 행동 → 폰 뒤지기·증거 챙기기 → 증거 들이밀기 → 판결 → 결과 카드.
콘솔 오류가 있으면 실패. 사용: python3 tests/e2e.py [base_url] [lang] [mode] [w h]
화질은 GFX 환경변수(기본 low): 소프트웨어 렌더링(SwiftShader)에서는 high 의 GTAO 가 너무 느려 클릭이 밀린다"""
import os, sys, time
from playwright.sync_api import sync_playwright
base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html'
lang = sys.argv[2] if len(sys.argv) > 2 else 'ko'
mode = sys.argv[3] if len(sys.argv) > 3 else 'h'
W, H = (int(sys.argv[4]), int(sys.argv[5])) if len(sys.argv) > 5 else (1280, 800)
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    pg = b.new_page(viewport={'width': W, 'height': H}, has_touch=W < 700, is_mobile=W < 700)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{base}?seed=11&fast&lang={lang}&mode={mode}&gfx={os.environ.get("GFX", "low")}')
    pg.wait_for_function('window.__ready', timeout=120000)
    pg.click('#go')
    def idle(t=120):
        pg.wait_for_function('!document.body.classList.contains("busy")', timeout=t * 1000)
    idle()
    def press(act, tab=None):
        if W < 700 and tab: pg.click(f'#acts .tabs [data-tab="{tab}"]'); time.sleep(0.2)
        pg.click(f'#acts .col.on [data-act="{act}"]' if W < 700 else f'#acts [data-act="{act}"]')
    for a, tab in [('baseline', 'ask'), ('push', 'ask'), ('slap', 'press'), ('tighten', 'press')]:
        press(a, tab); idle(); print('done', a)
    # 폰
    press('phone', 'other')
    pg.wait_for_selector('#phoneui.on [data-app]', timeout=60000)
    for app in ['card', 'gallery', 'messenger', 'maps']:
        pg.click(f'#phoneui [data-app="{app}"]'); time.sleep(0.2)
        rows = pg.query_selector_all('#phoneui .rows [data-i]')
        for i in range(len(rows)):
            pg.query_selector_all('#phoneui .rows [data-i]')[i].click(); time.sleep(0.1)
            tk = pg.query_selector('#phoneui .take:not([disabled])')
            if tk: tk.click(); time.sleep(0.1); print('took evidence in', app)
            pg.click('#phoneui .back'); time.sleep(0.1)
        pg.click('#phoneui .back'); time.sleep(0.1)
    pg.click('#phoneui .ret')
    idle()
    # 증거
    press('evidence', 'ask')
    pg.wait_for_selector('#pick.on')
    pg.click('#pickOpts button[data-i="0"]')
    idle(); print('evidence shown')
    pg.screenshot(path='/tmp/e2e_mid.png')
    pg.click('#acts .verdictWrap [data-act="__verdict"]' if W >= 700 else '#acts .tabs [data-act="__verdict"]')
    pg.wait_for_selector('#pick.on')
    pg.click('#pickOpts button[data-i="2"]')  # 이혼
    pg.wait_for_selector('#result.on', timeout=120000)
    time.sleep(0.5)
    pg.screenshot(path='/tmp/e2e_result.png')
    print('result:', pg.inner_text('#resultCard .rank'), '|', pg.inner_text('#resultCard h2'))
    b.close()
errs = [e for e in errs if 'GPU stall' not in e]
print('console errors:', errs)
sys.exit(1 if errs else 0)
