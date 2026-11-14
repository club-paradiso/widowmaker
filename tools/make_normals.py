#!/usr/bin/env python3
"""사진 질감(밝기)을 높이로 보고 노멀맵을 만든다: 벽지 무늬·나무 결·천 짜임·밧줄 꼬임이 빛에 따라 도드라지게.
사용: python3 -I tools/make_normals.py  (art/user 원본 → web/assets/*_n.webp)"""
import numpy as np
from PIL import Image, ImageFilter
JOBS = [  # 원본, 출력, 크기, 세기, 큰 얼룩을 지울 흐림 반경
    ('art/user/04.png', 'wall_n.webp', (1024, 683), 4.0, 24),
    ('art/user/05.png', 'floor_n.webp', (1024, 683), 3.0, 30),
    ('art/user/06.png', 'curtain_n.webp', (1024, 683), 5.0, 12),
]
def rope():
    im = Image.open('art/user/07.png').convert('L').crop((36, 0, 100, 1024)).rotate(90, expand=True).resize((512, 32), Image.LANCZOS)
    return im
for src, dst, size, k, blur in JOBS + [(None, 'rope_n.webp', (512, 32), 6.0, 4)]:
    g = (rope() if src is None else Image.open(src).convert('L').resize(size, Image.LANCZOS))
    h = np.asarray(g).astype(float) / 255
    low = np.asarray(g.filter(ImageFilter.GaussianBlur(blur))).astype(float) / 255
    h = h - low
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * k
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * k
    n = np.dstack([-dx, dy, np.ones_like(h)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save('web/assets/' + dst, 'WEBP', quality=88)
    print(dst)
