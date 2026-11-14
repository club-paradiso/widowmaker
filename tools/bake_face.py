#!/usr/bin/env python3
"""사용자가 준 정면·양옆 얼굴 사진(art/user/face_*.png)을 남편 머리 UV 에 투영해 피부 질감으로 굽는다.
표정·나이·털 같은 3D 장치는 그대로 두고 얼굴 피부만 사진처럼 바꾼다.
- 얼굴 기준점: MediaPipe 얼굴 랜드마크(art/user/face_landmarks.json) ↔ 메시 기준점(눈·코끝·입·턱)
- 정면은 세로를 구간별로 늘려(눈→코→입→턱) 이목구비 높이를 메시에 맞추고, 옆은 회전 없는 확대·이동으로 맞춘다
- 머리카락·배경·옷 화소는 버리고, 원래 피부와 색을 맞춘 뒤 가장자리를 부드럽게 섞는다
사용: python3 -I tools/bake_face.py --glb work/husband_raw.glb --skin SKIN.png --out web/assets/husband_skin.webp [--debug DIR]"""
import argparse, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
import glbread

ap = argparse.ArgumentParser()
ap.add_argument('--glb', required=True); ap.add_argument('--skin', required=True); ap.add_argument('--out', required=True)
ap.add_argument('--size', type=int, default=4096); ap.add_argument('--debug'); ap.add_argument('--match', type=float, default=0.6, help='사진 색을 원래 피부색에 맞추는 정도 0~1')
a = ap.parse_args()
J, M, _ = glbread.load(a.glb)
B = M[[k for k in M if k.startswith('body.')][0]]
P, N, UV, F = B['pos'], B['nrm'], B['uv'], B['idx']
E = M[[k for k in M if k.startswith('eyes.')][0]]['pos']
LASH = M[[k for k in M if k.startswith('eyelashes.')][0]]['pos']
LM = {k: np.array(v) for k, v in json.load(open('art/user/face_landmarks.json')).items()}
IMG = {k: np.asarray(Image.open(f'art/user/face_{k}.png').convert('RGB')).astype(np.float32) / 255 for k in ('front', 'left', 'right')}

# ---- 메시 기준점(머리 정중선 옆모습에서 찾음)
eyeL, eyeR = E[E[:, 0] > 0].mean(0), E[E[:, 0] < 0].mean(0)
eyeY = (eyeL[1] + eyeR[1]) / 2
mid = np.abs(P[:, 0]) < 0.004
def prof(y):  # 정중선에서 그 높이의 가장 앞(z)
    s = mid & (np.abs(P[:, 1] - y) < 0.003)
    return P[s, 2].max() if s.any() else -1
ys = np.arange(eyeY - 0.005, eyeY - 0.17, -0.001); zs = np.array([prof(y) for y in ys])
i_nose = np.argmax(np.where(ys > eyeY - 0.07, zs, -1)); noseY, noseZ = ys[i_nose], zs[i_nose]
sub = (ys < noseY - 0.01) & (ys > noseY - 0.035); i_sub = np.where(sub)[0][np.argmin(zs[sub])]   # 코밑
lipU = (ys < ys[i_sub]) & (ys > ys[i_sub] - 0.025); i_lu = np.where(lipU)[0][np.argmax(zs[lipU])]  # 윗입술
lipL = (ys < ys[i_lu] - 0.006) & (ys > ys[i_lu] - 0.03); i_ll = np.where(lipL)[0][np.argmax(zs[lipL])]  # 아랫입술 볼록점
i_mouth = i_lu + np.argmin(zs[i_lu:i_ll + 1]); mouthY = ys[i_mouth]                    # 두 입술 사이 오목한 곳
chin_rng = (ys < mouthY - 0.02) & (zs > noseZ - 0.05)
i_chin = np.where(chin_rng)[0].max(); chinY, chinZ = ys[i_chin], zs[i_chin]          # 턱 끝(앞에서 보이는 가장 낮은 곳)
outer = LASH[np.abs(LASH[:, 0]) > np.abs(LASH[:, 0]).max() - 0.006]
eyeOutY, eyeOutZ, eyeOutX = outer[:, 1].mean(), outer[:, 2].mean(), np.abs(outer[:, 0]).mean()
print(f'mesh eyeY {eyeY:.4f} nose {noseY:.4f}/{noseZ:.4f} mouth {mouthY:.4f} chin {chinY:.4f}/{chinZ:.4f} eyeOut {eyeOutY:.4f},{eyeOutZ:.4f}')

# ---- 정면 투영: x 는 눈 사이로 선형, y 는 구간별 선형
F_ = LM['front']
eL_img = (F_[362, :2] + F_[263, :2]) / 2   # 피사체 왼눈(이미지 오른쪽)
eR_img = (F_[33, :2] + F_[133, :2]) / 2
sx = (eL_img[0] - eR_img[0]) / (eyeL[0] - eyeR[0]); cx = (eL_img[0] + eR_img[0]) / 2
eyeIy = (eL_img[1] + eR_img[1]) / 2
knots_m = np.array([eyeY, noseY, mouthY, chinY]); knots_i = np.array([eyeIy, F_[1, 1], F_[13, 1], F_[152, 1]])
def front_uv(p):
    y = p[:, 1]
    yi = np.interp(-y, -knots_m, knots_i)  # 범위 안
    top = y > eyeY; bot = y < chinY
    s_top = (knots_i[1] - knots_i[0]) / (knots_m[0] - knots_m[1]); s_bot = (knots_i[3] - knots_i[2]) / (knots_m[2] - knots_m[3])
    yi = np.where(top, knots_i[0] - (y - eyeY) * s_top, yi)
    yi = np.where(bot, knots_i[3] + (chinY - y) * s_bot, yi)
    return np.stack([cx + p[:, 0] * sx, yi], 1)
# ---- 옆 투영: 앞뒤(z)는 코끝·귀 가운데 두 점으로 선형, 높이(y)는 정면처럼 구간별(눈꼬리→코끝→입→턱)
EAR = {'right': (450, 715), 'left': (695, 730)}   # 사진에서 귀 가운데(눈으로 읽음, 픽셀). MediaPipe 는 귀를 찾지 않는다
ear_m = P[(np.abs(P[:, 0]) > 0.08) & (P[:, 1] > 1.72) & (P[:, 1] < 1.83)]
earZ, earY = ear_m[:, 2].mean(), ear_m[:, 1].mean()
def fit_side(L, name):
    eo = L[33] if name == 'right' else (L[33] if L[33, 0] > L[263, 0] else L[263])
    ex, ey = EAR[name]
    az = (L[1, 0] - ex) / (noseZ - earZ); bz = L[1, 0] - az * noseZ
    km = np.array([eyeOutY, noseY, mouthY, chinY]); ki = np.array([eo[1], L[1, 1], L[13, 1], L[152, 1]])
    s_top = (ki[1] - ki[0]) / (km[0] - km[1]); s_bot = (ki[3] - ki[2]) / (km[2] - km[3])
    print(name, 'z-scale', round(az, 1), 'y-knots', ki.round(0))
    def proj(p):
        y = p[:, 1]; yi = np.interp(-y, -km, ki)
        yi = np.where(y > km[0], ki[0] - (y - km[0]) * s_top, yi); yi = np.where(y < km[3], ki[3] + (km[3] - y) * s_bot, yi)
        return np.stack([bz + az * p[:, 2], yi], 1)
    return proj
side_r = fit_side(LM['right'], 'right')
side_l = fit_side(LM['left'], 'left')

def sample(img, uv):
    h, w, _ = img.shape
    x = np.clip(uv[:, 0], 0, w - 1.001); y = np.clip(uv[:, 1], 0, h - 1.001)
    x0, y0 = x.astype(int), y.astype(int); fx, fy = (x - x0)[:, None], (y - y0)[:, None]
    c = img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x0 + 1] * fx * (1 - fy) + img[y0 + 1, x0] * (1 - fx) * fy + img[y0 + 1, x0 + 1] * fx * fy
    inside = (uv[:, 0] >= 0) & (uv[:, 0] < w - 1) & (uv[:, 1] >= 0) & (uv[:, 1] < h - 1)
    return c, inside
def skin_ok(c):  # 피부 화소만: 배경(채도 낮은 회색)·머리카락·옷(아주 어두움) 제외
    mx, mn = c.max(1), c.min(1); sat = (mx - mn) / np.maximum(mx, 1e-3); lum = c @ np.array([0.3, 0.59, 0.11])
    return np.clip((sat - 0.12) / 0.08, 0, 1) * np.clip((lum - 0.33) / 0.1, 0, 1)  # 머리카락 가장자리의 어중간한 화소도 뺀다

# ---- 머리 삼각형을 UV 로 래스터(텍셀마다 3D 위치·법선)
S = a.size
head = P[F].mean(1)[:, 1] > chinY - 0.09
Fh = F[head]
pos_buf = np.zeros((S, S, 3), np.float32); nrm_buf = np.zeros((S, S, 3), np.float32); cov = np.zeros((S, S), bool)
for t in Fh:
    q = UV[t] * S  # glTF UV: v 아래쪽 = 이미지 행
    x0, y0 = np.floor(q.min(0)).astype(int); x1, y1 = np.ceil(q.max(0)).astype(int)
    x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, S - 1), min(y1, S - 1)
    if x1 < x0 or y1 < y0: continue
    xs, ys_ = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    (ax_, ay_), (bx, by), (cx_, cy_) = q
    den = (by - cy_) * (ax_ - cx_) + (cx_ - bx) * (ay_ - cy_)
    if abs(den) < 1e-12: continue
    l0 = ((by - cy_) * (xs - cx_) + (cx_ - bx) * (ys_ - cy_)) / den; l1 = ((cy_ - ay_) * (xs - cx_) + (ax_ - cx_) * (ys_ - cy_)) / den; l2 = 1 - l0 - l1
    m = (l0 >= -0.02) & (l1 >= -0.02) & (l2 >= -0.02)
    if not m.any(): continue
    L3 = np.stack([l0[m], l1[m], l2[m]], 1)
    yy, xx = np.nonzero(m); yy += y0; xx += x0
    pos_buf[yy, xx] = L3 @ P[t]; nrm_buf[yy, xx] = L3 @ N[t]; cov[yy, xx] = True
yy, xx = np.nonzero(cov); p = pos_buf[yy, xx]; n = nrm_buf[yy, xx]; n /= np.maximum(1e-6, np.linalg.norm(n, axis=1))[:, None]
print('texels', len(p))

cols, ws = [], []
for name, proj, w in [('front', front_uv, np.clip(n[:, 2], 0, 1) ** 2.5),
                      ('right', side_r, np.clip(-n[:, 0], 0, 1) ** 2.5),
                      ('left', side_l, np.clip(n[:, 0], 0, 1) ** 2.5)]:
    c, inside = sample(IMG[name], proj(p))
    ok = skin_ok(c)
    # 얼굴 안쪽(눈썹·속눈썹·수염·콧구멍)은 어두워도 살린다: 머리카락 판정은 이마 위쪽·관자놀이·귀 뒤에만
    brow_zone = (p[:, 1] < eyeY + 0.04) & (np.abs(p[:, 0]) < 0.062) & (p[:, 2] > 0.09)
    mx, mn = c.max(1), c.min(1); lum = c @ np.array([0.3, 0.59, 0.11])
    bg = 1 - (1 - np.clip(((mx - mn) / np.maximum(mx, 1e-3) - 0.06) / 0.06, 0, 1)) * np.clip((lum - 0.3) / 0.08, 0, 1)  # 회색 배경(채도 낮고 중간 밝기)만 뺀다. 짙은 눈썹은 살린다
    ok = np.where(brow_zone, bg, ok) * inside
    cols.append(c); ws.append(w * ok)
# 입술 안쪽·콧구멍처럼 어느 사진에도 정면으로 안 보이는 면: 정면 사진을 약하게라도 쓴다(원래 질감의 이빨 무늬가 비치지 않게)
inner = (np.abs(p[:, 0]) < 0.06) & (p[:, 2] > 0.1) & (p[:, 1] < eyeY) & (p[:, 1] > chinY)
ws[0] = np.where(inner, np.maximum(ws[0], 0.25 * skin_ok(cols[0]) + 0.2), ws[0])
W = np.stack(ws, 1); Wsum = W.sum(1)
col = (np.stack(cols, 1) * W[:, :, None]).sum(1) / np.maximum(Wsum, 1e-6)[:, None]
alpha = np.clip(Wsum * 2.5, 0, 1)
# 눈구멍 둘레: 사진의 흰자·홍채가 눈꺼풀에 묻지 않게 약하게
for e in (eyeL, eyeR):
    d = np.sqrt(((p[:, 0] - e[0]) / 0.017) ** 2 + ((p[:, 1] - e[1]) / 0.010) ** 2)
    alpha *= np.clip((d - 0.75) / 0.5, 0.25, 1)
# 목 아래로 갈수록 원래 피부로
alpha *= np.clip((p[:, 1] - (chinY - 0.07)) / 0.04, 0, 1)

base = np.asarray(Image.open(a.skin).convert('RGB').resize((S, S), Image.LANCZOS)).astype(np.float32) / 255
orig = base[yy, xx]
# 색 맞춤: 사진이 잘 덮인 볼·이마 화소의 평균·표준편차를 원래 피부 쪽으로
sel = alpha > 0.8
mu_p, sd_p = col[sel].mean(0), col[sel].std(0); mu_o, sd_o = orig[sel].mean(0), orig[sel].std(0)
k = a.match
col2 = col * (1 - k + k * mu_o / np.maximum(mu_p, 1e-4))  # 색조만 곱으로 맞춘다(대비를 줄이면 눈썹·수염이 옅어진다)
print('photo mean', mu_p.round(3), 'skin mean', mu_o.round(3))
# 알파를 UV 공간에서 흐려 경계를 부드럽게
A_img = np.zeros((S, S), np.float32); A_img[yy, xx] = alpha
A_s = np.asarray(Image.fromarray((A_img * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(S / 512))).astype(np.float32) / 255
A_s = np.clip((A_s - 0.25) / 0.75, 0, 1)  # 가장자리를 안쪽으로 줄여 머리카락·배경 경계선이 남지 않게
A_s = np.minimum(A_s, A_img)
out = base.copy()
C_img = base.copy(); C_img[yy, xx] = np.clip(col2, 0, 1)
out = base * (1 - A_s[..., None]) + C_img * A_s[..., None]
Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8)).save(a.out, 'WEBP', quality=90, method=6)
print('wrote', a.out)
if a.debug:
    os.makedirs(a.debug, exist_ok=True)
    for name, proj in [('front', front_uv), ('right', side_r), ('left', side_l)]:
        im = Image.open(f'art/user/face_{name}.png').convert('RGB'); d = ImageDraw.Draw(im)
        hv = P[(P[:, 1] > chinY - 0.05)]
        vis = hv[(hv[:, 2] > 0.05)] if name == 'front' else hv[(hv[:, 0] < -0.02)] if name == 'right' else hv[(hv[:, 0] > 0.02)]
        for q in proj(vis)[::2]: d.ellipse([q[0] - 1.5, q[1] - 1.5, q[0] + 1.5, q[1] + 1.5], fill=(0, 255, 0))
        for q in proj(np.array([[eyeL[0], eyeY, eyeL[2]], [eyeR[0], eyeY, eyeR[2]], [0, noseY, noseZ], [0, mouthY, 0.16], [0, chinY, chinZ], [0.09, earY, earZ]])): d.ellipse([q[0] - 6, q[1] - 6, q[0] + 6, q[1] + 6], outline=(255, 0, 0), width=3)
        im.resize((im.width // 2, im.height // 2)).save(f'{a.debug}/align_{name}.png')
    crop = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8))
    us, vs = UV[np.unique(Fh)].min(0) * S, UV[np.unique(Fh)].max(0) * S
    crop.crop((int(us[0]), int(us[1]), int(vs[0]), int(vs[1]))).save(f'{a.debug}/face_uv.png')
