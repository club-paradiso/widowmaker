#!/usr/bin/env python3
"""헤드리스 크롬으로 페이지를 열어 스크린샷을 찍는다(개발 확인용).
사용: python3 tools/shot.py URL out.png [--w 1280 --h 800 --wait __ready --eval JS]
콘솔 오류는 표준 출력으로 낸다."""
import argparse, sys, time
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('url'); ap.add_argument('out')
ap.add_argument('--w', type=int, default=1280); ap.add_argument('--h', type=int, default=800)
ap.add_argument('--wait', default='__ready'); ap.add_argument('--eval', action='append', default=[])
ap.add_argument('--timeout', type=int, default=90000); ap.add_argument('--mobile', action='store_true')
a = ap.parse_args()
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = b.new_context(viewport={'width': a.w, 'height': a.h}, device_scale_factor=1, is_mobile=a.mobile, has_touch=a.mobile)
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
    pg.goto(a.url)
    if a.wait:
        pg.wait_for_function(f'window.{a.wait}', timeout=a.timeout)
    for js in a.eval:
        r = pg.evaluate(js)
        if r is not None: print('eval:', r)
    pg.screenshot(path=a.out)
    for e in errs: print(e)
    b.close()
