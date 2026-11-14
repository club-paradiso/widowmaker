#!/usr/bin/env python3
"""남편 몸 UV 에 오목한 곳(쇄골 아래, 겨드랑이, 근육 사이 골, 귀·코 주변)을 어둡게 하는 지도를 굽는다.
정점 곡률(이웃 평균과의 차이를 법선에 투영)로 계산한다. 출력 L(1024): 128=중립, 낮을수록 오목(어둡게), 높을수록 볼록(밝게).
사용: python3 -I tools/bake_cavity.py --mpfb MPFB_DATA --muscle 0.9 --out web/assets/body_cavity.png"""
import argparse, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from build_human import read_obj, read_target
ap = argparse.ArgumentParser(); ap.add_argument('--mpfb', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--muscle', type=float, default=0.9, help='근육 결이 드러나게 근육 쪽 체형으로 계산')
a = ap.parse_args()
v, vt, f, g = read_obj(os.path.join(a.mpfb, '3dobjs/base.obj'))
v = v.copy()
for path, w in [(f'targets/macrodetails/universal-male-young-averagemuscle-averageweight.target.gz', 1 - a.muscle),
                (f'targets/macrodetails/universal-male-young-maxmuscle-averageweight.target.gz', a.muscle)]:
    p = os.path.join(a.mpfb, path)
    if os.path.exists(p):
        idx, d = read_target(p)
        if len(idx): v[idx] += d * w
tris = []
for (vi, ti), gg in zip(f, g):
    if gg != 'body': continue
    for k in range(1, len(vi) - 1): tris.append((vi[0], vi[k], vi[k + 1], ti[0], ti[k], ti[k + 1]))
T = np.array(tris)
# 정점 법선·이웃 평균
P0, P1, P2 = v[T[:, 0]], v[T[:, 1]], v[T[:, 2]]
fn = np.cross(P1 - P0, P2 - P0)
vn = np.zeros_like(v); 
for k in range(3): np.add.at(vn, T[:, k], fn)
vn /= np.maximum(1e-9, np.linalg.norm(vn, axis=1))[:, None]
acc = np.zeros_like(v); cnt = np.zeros(len(v))
for a_, b_ in [(0, 1), (1, 2), (2, 0)]:
    np.add.at(acc, T[:, a_], v[T[:, b_]]); np.add.at(cnt, T[:, a_], 1)
    np.add.at(acc, T[:, b_], v[T[:, a_]]); np.add.at(cnt, T[:, b_], 1)
lap = acc / np.maximum(1, cnt)[:, None] - v
curv = (lap * vn).sum(1)                       # +: 오목, -: 볼록
# 두 단계 매끄럽게(이웃 평균) → 큰 골이 살고 잡음이 준다
for _ in range(3):
    s = np.zeros(len(v)); c = np.zeros(len(v))
    for a_, b_ in [(0, 1), (1, 2), (2, 0)]:
        np.add.at(s, T[:, a_], curv[T[:, b_]]); np.add.at(c, T[:, a_], 1)
    curv = 0.5 * curv + 0.5 * s / np.maximum(1, c)
sc = np.percentile(np.abs(curv[np.unique(T[:, :3])]), 97)
val = np.clip(0.5 - np.clip(curv, 0, None) / sc * 0.5 + np.clip(-curv, 0, None) / sc * 0.12, 0, 1)  # 0.5 중립, 오목은 진하게·볼록은 살짝
S = 2048
buf = np.full((S, S), 0.5, np.float32)
for t in T:  # 정점 값을 삼각형 안에서 보간(면마다 한 색이면 각진 무늬가 생긴다)
    q = np.array([(vt[t[3 + k], 0] * S, (1 - vt[t[3 + k], 1]) * S) for k in range(3)])
    x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax_, ay_), (bx, by), (cx, cy) = q
    den = (by - cy) * (ax_ - cx) + (cx - bx) * (ay_ - cy)
    if abs(den) < 1e-9: continue
    l0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / den
    l1 = ((cy - ay_) * (xs - cx) + (ax_ - cx) * (ys - cy)) / den
    l2 = 1 - l0 - l1
    m = (l0 >= -0.01) & (l1 >= -0.01) & (l2 >= -0.01)
    vv = l0 * val[t[0]] + l1 * val[t[1]] + l2 * val[t[2]]
    buf[y0:y1 + 1, x0:x1 + 1][m] = vv[m]
im = Image.fromarray((buf * 255).astype(np.uint8))
im = im.filter(ImageFilter.GaussianBlur(4)).resize((1024, 1024), Image.LANCZOS)
im.save(a.out, optimize=True); print('wrote', a.out)
