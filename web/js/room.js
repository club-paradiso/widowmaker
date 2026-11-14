// 방(전부 three.js 로 만든다): 밤의 거실 겸 다이닝. 천장 고리와 줄, 펜던트 조명, 창, 식탁, 주방 카운터.
// 남편은 원점에서 +Z(카메라 쪽)를 보고 서 있다. 숫자(크기·색·위치)는 설계 판단.
import * as THREE from 'three';

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
const rnd = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();

// 사진 질감(Higgsfield 로 만든 webp)이 있으면 캔버스 질감을 바꿔 끼운다. 없으면 캔버스 그대로
// mirror=true 면 거울 반복으로 이어 붙여 이음새를 없앤다(사용자 제작 사진은 타일이 완벽히 맞지 않음)
function photoTex(url, mat, repeat, key = 'map', mirror = true) {
  new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = mirror ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
    mat[key] = t; mat.needsUpdate = true;
  }, undefined, () => {});
}

export function makeRoom(scene) {
  const R = { group: new THREE.Group(), lights: {} };
  scene.add(R.group);
  const W = 4.6, D = 5.2, H = 2.55; // 방 크기(m). 남편은 x=0, z=0. 방 중심은 z=0.6
  const cz = 0.6;
  // 바닥: 짙은 원목 마루
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      let x = -rnd() * 300;
      while (x < w) {
        const len = 260 + rnd() * 260; const v = 70 + rnd() * 26;
        g.fillStyle = `rgb(${v + 30},${v + 4},${v - 22})`; g.fillRect(x, (i * h) / rows, len, h / rows);
        for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(40,20,8,${0.05 + rnd() * 0.08})`; g.beginPath(); const y = (i * h) / rows + rnd() * (h / rows); g.moveTo(x, y); g.bezierCurveTo(x + len * 0.3, y + rnd() * 6 - 3, x + len * 0.6, y + rnd() * 6 - 3, x + len, y); g.stroke(); }
        g.fillStyle = 'rgba(15,8,3,0.7)'; g.fillRect(x, (i * h) / rows, 2, h / rows);
        x += len;
      }
      g.fillStyle = 'rgba(15,8,3,0.8)'; g.fillRect(0, (i * h) / rows, w, 2);
    }
  }, [2.5, 2.5]);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.62 }));
  floor.rotation.x = -Math.PI / 2; floor.position.z = cz; floor.receiveShadow = true; R.group.add(floor);
  photoTex('./assets/floor.webp', floor.material, [2.1, 3.6]);
  // 벽지: 따뜻한 회색, 아주 옅은 세로 무늬
  const wallTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#b8aa98'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { g.fillStyle = `rgba(255,255,255,${0.025 + (x % 64 === 0 ? 0.03 : 0)})`; g.fillRect(x, 0, 6, h); }
    for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.04})`; g.fillRect(rnd() * w, rnd() * h, 1, 1); }
  }, [3, 1.5]);
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.92 });
  photoTex('./assets/wall.webp', wallMat, [3, 2.5]);
  const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; R.group.add(m); return m; };
  wall(W, 0, cz - D / 2, 0); wall(W, 0, cz + D / 2, Math.PI); wall(D, -W / 2, cz, Math.PI / 2); wall(D, W / 2, cz, -Math.PI / 2);
  // 걸레받이
  const base = new THREE.MeshStandardMaterial({ color: 0x3a2c22, roughness: 0.6 });
  for (const [w, x, z, ry] of [[W, 0, cz - D / 2 + 0.006, 0], [D, -W / 2 + 0.006, cz, Math.PI / 2], [D, W / 2 - 0.006, cz, -Math.PI / 2]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.012), base); b.position.set(x, 0.04, z); b.rotation.y = ry; R.group.add(b);
  }
  // 천장
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xd9d2c6, roughness: 1 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, H, cz); R.group.add(ceil);
  R.H = H;

  // 창(뒤쪽 벽, 남편 뒤 왼편): 밤의 푸른 빛과 먼 불빛
  const nightTex = canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0c1424'); gr.addColorStop(1, '#1b2436'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) { // 먼 아파트
      const bx = rnd() * w, bw = 40 + rnd() * 60, bh = 120 + rnd() * 220;
      g.fillStyle = '#0a0f1a'; g.fillRect(bx, h - bh, bw, bh);
      for (let y = h - bh + 8; y < h - 6; y += 14) for (let x = bx + 5; x < bx + bw - 6; x += 11) if (rnd() < 0.18) { g.fillStyle = rnd() < 0.7 ? '#e8b86a' : '#9ec2e8'; g.fillRect(x, y, 5, 6); }
    }
  });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.25), new THREE.MeshBasicMaterial({ map: nightTex }));
  win.position.set(-1.05, 1.45, cz - D / 2 + 0.01); R.group.add(win); R.window = win; R.nightTex = nightTex;
  let nightPhoto = null, morningPhoto = null;
  new THREE.TextureLoader().load('./assets/night.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; const a = t.image.width / t.image.height, rx = Math.min(1, (1.3 / 1.25) / a); t.repeat.set(rx, 1); t.offset.set((1 - rx) / 2, 0); nightPhoto = t; if (!R.isMorning) { win.material.map = t; win.material.needsUpdate = true; } }, undefined, () => {});
  new THREE.TextureLoader().load('./assets/morning.webp', (t) => { t.colorSpace = THREE.SRGBColorSpace; const a = t.image.width / t.image.height, rx = Math.min(1, (1.3 / 1.25) / a); t.repeat.set(rx, 1); t.offset.set((1 - rx) / 2, 0); morningPhoto = t; }, undefined, () => {});
  const frameM = new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.5 });
  for (const [w, h, x, y] of [[1.38, 0.05, 0, 0.64], [1.38, 0.05, 0, -0.64], [0.05, 1.3, -0.67, 0], [0.05, 1.3, 0.67, 0], [0.035, 1.25, 0, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameM); f.position.set(-1.05 + x, 1.45 + y, cz - D / 2 + 0.025); R.group.add(f);
  }
  // 커튼(반쯤 닫힘)
  const curtainTex = canvasTex(256, 256, (g, w, h) => { for (let x = 0; x < w; x++) { const v = 105 + 30 * Math.sin(x * 0.19) + 10 * Math.sin(x * 0.53); g.fillStyle = `rgb(${v * 0.7},${v * 0.55},${v * 0.48})`; g.fillRect(x, 0, 1, h); } });
  const curtainMat = new THREE.MeshStandardMaterial({ map: curtainTex, roughness: 1, side: THREE.DoubleSide }); photoTex('./assets/curtain.webp', curtainMat, [0.6, 1.4]);
  const curtain = (x) => { const cm = curtainMat; const c = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.95, 24, 1), cm); const p = c.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 28) * 0.03); c.geometry.computeVertexNormals(); c.position.set(x, 1.32, cz - D / 2 + 0.09); c.castShadow = true; R.group.add(c); };
  curtain(-1.62); curtain(-0.62);
  const moon = new THREE.DirectionalLight(0x6f8fd0, 0.25); moon.position.set(-1.0, 1.8, cz - D / 2 - 1); moon.target.position.set(0, 0, 0.5); R.group.add(moon, moon.target); R.lights.moon = moon;

  // 주방 카운터(오른쪽 벽)
  const counterM = new THREE.MeshStandardMaterial({ color: 0x4b4038, roughness: 0.7 });
  const topM = new THREE.MeshStandardMaterial({ color: 0xcfc8bd, roughness: 0.35 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.88, 2.0), counterM); counter.position.set(W / 2 - 0.31, 0.44, cz - 0.9); counter.castShadow = counter.receiveShadow = true; R.group.add(counter);
  const ctop = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 2.04), topM); ctop.position.set(W / 2 - 0.33, 0.9, cz - 0.9); ctop.receiveShadow = true; R.group.add(ctop);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.62, 2.0), counterM); cab.position.set(W / 2 - 0.18, 1.86, cz - 0.9); R.group.add(cab);
  // 냉장고
  const fridge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.85, 0.68), new THREE.MeshStandardMaterial({ color: 0x9da2a3, roughness: 0.3, metalness: 0.4 }));
  fridge.position.set(W / 2 - 0.36, 0.925, cz + 0.62); fridge.castShadow = true; R.group.add(fridge);
  // 식탁과 의자(왼쪽 앞)
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.55 });
  R.table = new THREE.Group();
  const tt = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.8), wood); tt.position.y = 0.73; tt.castShadow = tt.receiveShadow = true; R.table.add(tt);
  for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.71, 0.05), wood); l.position.set(x, 0.355, z); l.castShadow = true; R.table.add(l); }
  R.table.position.set(-1.45, 0, 1.25); R.table.rotation.y = 0.08; R.group.add(R.table);
  const chair = (x, z, ry) => { const c = new THREE.Group(); const s = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.42), wood); s.position.y = 0.45; c.add(s); const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.45, 0.03), wood); b.position.set(0, 0.7, -0.2); c.add(b); for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.45, 0.035), wood); l.position.set(lx, 0.225, lz); c.add(l); } c.position.set(x, 0, z); c.rotation.y = ry; c.traverse((o) => { if (o.isMesh) o.castShadow = true; }); R.group.add(c); return c; };
  chair(-1.45, 0.65, 0); chair(-1.45, 1.85, Math.PI);
  // 벽시계(오른쪽 위)
  const clockFace = canvasTex(256, 256, (g) => { g.fillStyle = '#efe9df'; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill(); g.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = (i * Math.PI) / 6; g.fillRect(128 + Math.sin(a) * 104 - 3, 128 - Math.cos(a) * 104 - 10, 6, 20); } });
  const clkMat = new THREE.MeshStandardMaterial({ map: clockFace, roughness: 0.6 }); photoTex('./assets/clock.webp', clkMat, [1, 1], 'map', false);
  const clk = new THREE.Mesh(new THREE.CircleGeometry(0.17, 40), clkMat);
  clk.position.set(0.95, 2.0, cz - D / 2 + 0.02); R.group.add(clk);
  const hand = (len, w, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), new THREE.MeshBasicMaterial({ color: c })); m.geometry.translate(0, len / 2, 0); m.position.set(0.95, 2.0, cz - D / 2 + 0.03); R.group.add(m); return m; };
  R.clockH = hand(0.09, 0.012, 0x222222); R.clockM = hand(0.115, 0.008, 0x222222);
  R.setClock = (min) => { const h = (min / 60) % 12; R.clockH.rotation.z = -(h / 12) * Math.PI * 2; R.clockM.rotation.z = -((min % 60) / 60) * Math.PI * 2; };

  // 천장 고리와 줄(줄은 손목까지 매 프레임 다시 그린다)
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8a88, roughness: 0.35, metalness: 0.85 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), metal); plate.position.set(0, H - 0.008, 0.02); R.group.add(plate);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 10, 24), metal); ring.position.set(0, H - 0.06, 0.02); R.group.add(ring);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 8), metal); stem.position.set(0, H - 0.025, 0.02); R.group.add(stem);
  R.hookPoint = new THREE.Vector3(0, H - 0.09, 0.02);
  const ropeTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = '#b39b74'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 8) { g.strokeStyle = 'rgba(70,52,30,0.6)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + 8); g.stroke(); } }, [1, 30]);
  const ropeMat = new THREE.MeshStandardMaterial({ map: ropeTex, roughness: 0.95 }); photoTex('./assets/rope.webp', ropeMat, [10, 1]);
  let rope = null, wrap = null;
  R.updateRope = (wristMid, wristL, wristR) => {
    const top = R.hookPoint;
    const sag = 0.0;
    const mid = top.clone().lerp(wristMid, 0.5); mid.x += sag;
    const curve = new THREE.CatmullRomCurve3([top.clone(), mid, wristMid.clone().add(new THREE.Vector3(0, 0.03, 0))]);
    if (rope) { rope.geometry.dispose(); } else { rope = new THREE.Mesh(undefined, ropeMat); rope.castShadow = true; R.group.add(rope); }
    rope.geometry = new THREE.TubeGeometry(curve, 8, 0.0075, 6, false);
    // 손목에 감긴 매듭(두 손목 사이)
    if (!wrap) { wrap = new THREE.Mesh(new THREE.TorusGeometry(0.048, 0.012, 8, 20), ropeMat); wrap.castShadow = true; R.group.add(wrap); }
    wrap.position.copy(wristMid).add(new THREE.Vector3(0, 0.0, 0));
    wrap.lookAt(wristMid.clone().add(wristL.clone().sub(wristR)));
    wrap.scale.set(1, 1.35, 1);
  };
  R.setRopeVisible = (v) => { if (rope) rope.visible = v; if (wrap) wrap.visible = v; ring.visible = true; };

  // 조명: 머리 위 펜던트(따뜻한 스폿) + 아주 약한 주변광
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x120c08 }));
  shade.position.set(0.62, H - 0.5, -0.15); R.group.add(shade);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.42, 6), new THREE.MeshBasicMaterial({ color: 0x111111 })); cord.position.set(0.62, H - 0.21, -0.15); R.group.add(cord);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2b0).multiplyScalar(7) })); // 화면 처리의 번짐(bloom)이 잡을 만큼 밝게 bulb.position.set(0.62, H - 0.58, -0.15); R.group.add(bulb);
  // 세기 20: 화면 처리(톤 매핑·번짐)가 들어가며 26 이면 조명 쪽 피부가 하얗게 탔다
  const KEY = 20; R.keyBase = KEY;
  const key = new THREE.SpotLight(0xffd6a0, KEY, 7, 0.95, 0.65, 1.6);
  key.position.set(0.6, H - 0.6, -0.1); key.target.position.set(0, 1.3, 0.2);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 18; key.shadow.blurSamples = 24; key.shadow.camera.near = 0.1;
  R.group.add(key, key.target); R.lights.key = key; R.bulb = bulb;
  const fill = new THREE.PointLight(0xffb880, 2.2, 6, 1.8); fill.position.set(-0.4, 1.7, 1.9); R.group.add(fill); R.lights.fill = fill;
  const amb = new THREE.HemisphereLight(0x8a7a6a, 0x1a120c, 0.25); R.group.add(amb); R.lights.amb = amb;
  // 아침(결말 뒤 장면)
  R.setMorning = (on) => {
    key.intensity = on ? 6 : KEY; bulb.visible = !on;
    moon.color.set(on ? 0xfff0d8 : 0x6f8fd0); moon.intensity = on ? 2.6 : 0.25; moon.castShadow = on;
    amb.intensity = on ? 0.9 : 0.25; amb.color.set(on ? 0xe8eef8 : 0x8a7a6a);
    fill.intensity = on ? 0.6 : 1.6;
    R.isMorning = on;
    if (on && morningPhoto) win.material.map = morningPhoto;
    else if (!on && nightPhoto) win.material.map = nightPhoto;
    else if (on) { win.material.map = canvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#cfe3f5'); gr.addColorStop(1, '#f6ecd8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
    else win.material.map = nightTex;
    win.material.needsUpdate = true;
  };
  return R;
}
