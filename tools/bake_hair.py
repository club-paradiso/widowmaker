#!/usr/bin/env python3
"""남편 몸 UV 위에 털·수염·땀 구역 지도를 굽는다(코드만으로, 외부 그림 없음).
출력 RGBA(2048): R=몸 털(가슴·배·겨드랑이·팔·다리) 가닥, G=수염 가닥, B=땀이 먼저 맺히는 구역(부드러운 값), A=수염 그늘(면도 자국).
런타임에서 나이에 따라 R·G·A 세기를, 긴장·고통에 따라 B 세기를 조절한다.
사용: python3 tools/bake_hair.py --mpfb MPFB_DATA --out web/assets/body_hair.webp
좌표 단위는 MakeHuman 기본 메시(dm, 앞=+z, A 자세)."""
import argparse, os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from build_human import read_obj, read_mhclo

ap = argparse.ArgumentParser(); ap.add_argument('--mpfb', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--scalp', help='두피 그늘 지도(L) 출력 경로'); ap.add_argument('--density', help='입체 털(셸)용 밀도 지도(RGB: 몸 털·수염·두피) 출력 경로'); ap.add_argument('--hair-mhclo', help='머리카락 프록시(.mhclo): 이 머리가 덮는 정점을 두피로 본다'); ap.add_argument('--size', type=int, default=2048); ap.add_argument('--seed', type=int, default=7)
a = ap.parse_args()
rng = np.random.default_rng(a.seed)
v, vt, f, g = read_obj(os.path.join(a.mpfb, '3dobjs/base.obj'))
gv = {}
for (vi, _), gg in zip(f, g): gv.setdefault(gg, set()).update(vi)
J = lambda n: v[sorted(gv[n])].mean(0)
jaw, neck, head = J('joint-jaw'), J('joint-neck'), J('joint-head')
shL, shR = J('joint-l-shoulder'), J('joint-r-shoulder')
elL, elR, haL, haR = J('joint-l-elbow'), J('joint-r-elbow'), J('joint-l-hand'), J('joint-r-hand')
pelvis, sp1, sp2 = J('joint-pelvis'), J('joint-spine-1'), J('joint-spine-2')

# 몸 삼각형(UV 포함)
tris = []
for (vi, ti), gg in zip(f, g):
    if gg != 'body': continue
    for k in range(1, len(vi) - 1): tris.append((vi[0], vi[k], vi[k + 1], ti[0], ti[k], ti[k + 1]))
T = np.array(tris)
P0, P1, P2 = v[T[:, 0]], v[T[:, 1]], v[T[:, 2]]
U0, U1, U2 = vt[T[:, 3]], vt[T[:, 4]], vt[T[:, 5]]
N = np.cross(P1 - P0, P2 - P0); area = np.linalg.norm(N, axis=1) * 0.5; N = N / np.maximum(1e-9, np.linalg.norm(N, axis=1))[:, None]
C = (P0 + P1 + P2) / 3

def smooth(x, a0, a1):
    t = np.clip((x - a0) / (a1 - a0), 0, 1); return t * t * (3 - 2 * t)
def band(x, lo, hi, w):
    return smooth(x, lo - w, lo + w) * (1 - smooth(x, hi - w, hi + w))
def near(p, c, r):
    return np.clip(1 - np.linalg.norm(p - c, axis=-1) / r, 0, 1)

x, y, z = C[:, 0], C[:, 1], C[:, 2]
front = smooth(N[:, 2], 0.05, 0.45)
# 가슴: 흉골 쪽이 진하고 옆으로 옅어진다
chest = front * band(y, 3.45, 4.85, 0.25) * np.clip(1 - np.abs(x) / 1.55, 0, 1) ** 0.8 * (0.55 + 0.45 * np.exp(-(x / 0.45) ** 2))
# 배꼽 아래로 이어지는 선
trail = front * band(y, 1.15, 3.5, 0.2) * np.exp(-(x / (0.22 + 0.25 * band(y, 2.2, 2.7, 0.2))) ** 2)
# 겨드랑이(A 자세에서 어깨 아래·안쪽)
pit = np.maximum(near(C, shL + np.array([-0.38, -0.78, 0.0]), 0.44), near(C, shR + np.array([0.38, -0.78, 0.0]), 0.44)) ** 0.45 * (y < shL[1] - 0.2)
# 팔뚝(팔꿈치→손목 바깥쪽)
def seg(c, a_, b_, r):
    ab = b_ - a_; t = np.clip(((c - a_) @ ab) / (ab @ ab), 0, 1); d = np.linalg.norm(c - (a_ + t[:, None] * ab), axis=1)
    return (d < r) * band(t, 0.15, 0.88, 0.08)
fore = np.maximum(seg(C, elL, haL, 0.6), seg(C, elR, haR, 0.6)) * 0.35
legs = band(y, -7.6, -0.6, 0.3) * 0.42 * (np.abs(x) > 0.25)
body = np.clip(np.maximum.reduce([chest, trail * 0.9, pit, fore, legs]), 0, 1)

# 수염: 입 아래·턱·턱선, 인중. 입술은 뺀다. 머리 앞쪽만
MOUTH_Y = 6.60  # 입술 사이 높이(기본 메시). joint-mouth 는 턱관절 안쪽이라 쓰지 않는다
rel = C - np.array([0.0, MOUTH_Y, 0.0])
face = (z > head[2] + 0.35) * (N[:, 2] > -0.2)
ax = np.abs(rel[:, 0])
soft = lambda q, lo, hi, w: smooth(q, lo - w, lo + w) * (1 - smooth(q, hi - w, hi + w))
lips = soft(ax, -1, 0.44, 0.06) * soft(rel[:, 1], -0.13, 0.08, 0.03) * (z > 1.2)
must = band(rel[:, 1], 0.08, 0.2, 0.05) * (1 - smooth(ax, 0.36, 0.52)) * (z > 1.2)               # 인중(코 밑~윗입술)
chinjaw = band(rel[:, 1], -0.47, 0.02, 0.1) * (1 - smooth(ax, 0.9, 1.12))                    # 입꼬리 높이 아래 턱·턱선
side = band(rel[:, 1], -0.47, 0.14, 0.1) * smooth(ax, 0.5, 0.68) * (1 - smooth(ax, 0.9, 1.12))  # 귀 앞으로 이어지는 옆선
under = band(y, 6.06, 6.18, 0.06) * (z > 0.55) * np.clip(1 - np.abs(x) / 0.7, 0, 1) * 0.35      # 턱 밑
beard = np.clip(face * np.maximum.reduce([must, chinjaw, side]) * (1 - lips) + under, 0, 1)
beard = beard * (y > neck[1] - 0.2)

# 땀 구역: 이마·관자, 인중, 목, 가슴 가운데, 겨드랑이, 등 위쪽
fore_head = band(y, 7.45, 8.15, 0.12) * (z > 0.6) * (np.abs(x) < 0.95)
neckz = band(y, 5.35, 6.15, 0.15) * (np.abs(x) < 0.75)
sternum = front * band(y, 3.3, 5.0, 0.3) * np.exp(-(x / 0.6) ** 2)
back = (N[:, 2] < -0.3) * band(y, 3.8, 5.3, 0.3) * np.exp(-(x / 1.0) ** 2) * 0.7
sweat = np.clip(np.maximum.reduce([fore_head, neckz, sternum, pit, must * face, back, trail * 0.5]), 0, 1)

# 피부가 아닌 섬(눈 안쪽·입 안·생식기 도우미)은 UV 위치로 뺀다(이미지 기준 비율 u, 1-v)
cu = (U0[:, 0] + U1[:, 0] + U2[:, 0]) / 3; cv = 1 - (U0[:, 1] + U1[:, 1] + U2[:, 1]) / 3
island = ((cu < 0.16) & (cv > 0.33) & (cv < 0.48)) | ((cu > 0.74) & (cv > 0.84)) | ((cu > 0.25) & (cu < 0.45) & (cv > 0.62) & (cv < 0.85))
keep = ~island
chest, trail, pit, fore, legs, beard, sweat = (q * keep for q in (chest, trail, pit, fore, legs, beard, sweat))
S = a.size * 2  # 두 배로 그리고 줄여서 가장자리를 부드럽게
def uvpx(u):  # OBJ uv(v 위쪽) → glTF/이미지(v 아래쪽) 픽셀
    return np.stack([u[..., 0] * S, (1 - u[..., 1]) * S], -1)

# 삼각형마다 3D→UV 변환(접평면)
E1, E2 = P1 - P0, P2 - P0
D1, D2 = uvpx(U1) - uvpx(U0), uvpx(U2) - uvpx(U0)
M3 = np.stack([E1, E2], -1)            # 3x2: (e1,e2)
M2 = np.stack([D1, D2], -1)            # 2x2
def to_uv(i, d3):  # 3D 방향 → UV 픽셀 변위
    A = M3[i]; B = M2[i]
    coef, *_ = np.linalg.lstsq(A, d3, rcond=None)  # d3 ≈ A @ coef
    return B @ coef

def strokes(dens, per_dm2, length, spread, down_bias, curl, width, img, seed_off=0):
    w = area * dens
    n = int(w.sum() * per_dm2)
    if n == 0: return
    idx = rng.choice(len(T), size=n, p=w / w.sum())
    r1, r2 = rng.random(n), rng.random(n)
    s = np.sqrt(r1); b0, b1, b2 = 1 - s, s * (1 - r2), s * r2
    p = b0[:, None] * P0[idx] + b1[:, None] * P1[idx] + b2[:, None] * P2[idx]
    uv = b0[:, None] * uvpx(U0[idx]) + b1[:, None] * uvpx(U1[idx]) + b2[:, None] * uvpx(U2[idx])
    d = ImageDraw.Draw(img)
    for k in range(n):
        i = idx[k]; nn = N[i]
        # 아래쪽 + 바깥쪽을 기본으로, 무작위로 비튼다
        base = np.array([np.sign(p[k, 0]) * 0.35, -1.0, 0.0]) * down_bias + rng.normal(0, spread, 3)
        base -= nn * (base @ nn)
        if np.linalg.norm(base) < 1e-6: continue
        base /= np.linalg.norm(base)
        L = length * (0.6 + 0.8 * rng.random())
        pts = [uv[k]]; cur = base.copy(); q = uv[k].copy()
        for st in range(3):  # 세 마디로 살짝 휘게
            dv = to_uv(i, cur * L / 3); q = q + dv; pts.append(q.copy())
            ax = np.cross(nn, cur); cur = cur + ax * curl * rng.normal(0, 1); cur -= nn * (cur @ nn); cur /= max(1e-6, np.linalg.norm(cur))
        if np.abs(pts[-1] - pts[0]).max() > S * 0.03: skipped[0] += 1; continue  # UV 이음매를 넘어가는 가닥은 버린다
        dk = dens[i]  # 구역 가장자리(옅은 곳)는 가늘고 흐리게 → 그려 넣은 경계가 덜 보인다
        d.line([tuple(t) for t in pts], fill=int((90 + 165 * rng.random()) * (0.35 + 0.65 * dk)), width=width if dk > 0.55 else 1)

skipped = [0]
imgR = Image.new('L', (S, S), 0); imgG = Image.new('L', (S, S), 0)
strokes(np.maximum.reduce([chest, trail]), 2600, 0.17, 0.55, 1.0, 0.6, 2, imgR)
strokes(pit, 15000, 0.22, 1.2, 0.3, 1.0, 2, imgR)
strokes(fore, 1500, 0.09, 0.35, 0.0, 0.2, 2, imgR)
strokes(legs, 1300, 0.11, 0.35, 1.0, 0.25, 2, imgR)
strokes(beard, 30000, 0.035, 0.6, 1.0, 0.3, 2, imgG)

def field(vals, blur):
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    for k in np.nonzero(vals > 0.02)[0]:
        pts = [tuple(uvpx(U0[k])), tuple(uvpx(U1[k])), tuple(uvpx(U2[k]))]
        d.polygon(pts, fill=int(255 * vals[k]))
    return im.filter(ImageFilter.GaussianBlur(blur))
imgB = field(sweat, 10)
imgA = field(beard, 14)
# 채널마다 따로 줄인다(RGBA 를 통째로 줄이면 투명한 곳의 RGB 가 0 이 된다)
out = Image.merge('RGBA', [c.resize((a.size, a.size), Image.LANCZOS) for c in (imgR, imgG, imgB, imgA)])
out.save(a.out, optimize=True)  # PNG: 손실 WebP 는 채널끼리 번지고, 투명한 곳의 RGB 를 버린다
if a.scalp:  # 두피: 머리카락 사이로 피부가 비치지 않게 어둡게 깔 곳(앞 헤어라인·옆·뒤)
    if a.hair_mhclo:  # 머리카락 프록시가 붙어 있는 정점 = 머리가 덮는 곳
        mh = read_mhclo(a.hair_mhclo)
        cov = np.zeros(len(v)); 
        for r in mh['verts']:
            for vi, w in zip(r[0], r[1]): cov[vi] = max(cov[vi], 1.0)
        scalp = np.clip((cov[T[:, 0]] + cov[T[:, 1]] + cov[T[:, 2]]) / 3 * 1.5, 0, 1)
    else:
        hc = C[:, 1] > 7.0
        scalp = hc * np.maximum(smooth(y, 7.68, 7.8), smooth(y, 7.25, 7.45) * (1 - smooth(z, 0.2, 0.6)) * smooth(np.abs(x), 0.55, 0.75))
    sc_img = field(np.clip(scalp * keep, 0, 1), 12)
    sc_img.resize((1024, 1024), Image.LANCZOS).save(a.scalp, optimize=True)
    print('wrote', a.scalp)
    if a.density:  # 셸 털이 자랄 곳과 세기: 가장자리가 부드럽게 사라지도록 흐리게
        body_d = np.clip(np.maximum.reduce([chest, trail * 0.9, pit, fore, legs]), 0, 1)
        dens = Image.merge('RGB', [field(body_d, 8), field(beard, 18), sc_img])  # 수염 가장자리를 넓게 흐려 경계선이 보이지 않게
        dens.resize((1024, 1024), Image.LANCZOS).save(a.density, optimize=True)
        print('wrote', a.density)
print('skipped', skipped[0]); print('wrote', a.out, 'strands', int((np.asarray(imgR) > 0).sum()), int((np.asarray(imgG) > 0).sum()))
