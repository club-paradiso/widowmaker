// 소품(전부 기본 도형). 손에 쥐는 물건은 grip 틀 기준: Y=손가락 방향, Z=손바닥이 향하는 쪽, 원점=손바닥 중심.
import * as THREE from 'three';

const M = (c, r = 0.5, m = 0, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, ...(e ? { emissive: e } : {}) });
const shadow = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };

// 스마트폰(14.7×7.1cm). 화면은 손바닥 반대쪽(-Z)을 본다 → 쥔 사람이 아니라 앞사람에게 보여주는 방향은 클립이 정한다
let _lock = null;
const lockTex = () => { if (!_lock) { _lock = new THREE.TextureLoader().load('./assets/lock.webp'); _lock.colorSpace = THREE.SRGBColorSpace; } return _lock; };
// 이혼 서류 양식(사용자 제작 art/user/13). 그림을 읽기 전에는 캔버스로 그린 칸만 보인다
let _form = null;
const formImg = () => { if (!_form) { _form = new Image(); _form.src = './assets/form.webp'; } return _form; };
export function phone() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.071, 0.147, 0.008), M(0x1a1a1c, 0.3, 0.6));
  g.add(body);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.14), new THREE.MeshBasicMaterial({ color: 0x0b0b0e }));
  scr.position.z = -0.0042; scr.rotation.y = Math.PI; g.add(scr);
  g.userData.screen = scr;
  g.position.set(0, 0.02, 0.012);
  // 켜지면 잠금화면(사용자 제작 art/user/14: 결혼사진 뒷모습)이 보인다
  g.userData.setGlow = (on, color = 0xe9f0ff) => { scr.material.map = on ? lockTex() : null; scr.material.color.set(on ? color : 0x0b0b0e); scr.material.needsUpdate = true; };
  return shadow(g);
}
// 물컵
export function cup() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.032, 0.11, 24, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.08, 24), new THREE.MeshPhysicalMaterial({ color: 0xbfd8f0, roughness: 0.05, transparent: true, opacity: 0.45 }));
  water.position.y = -0.012; g.add(glass, water); g.userData.water = water;
  g.rotation.z = Math.PI / 2; g.position.set(0.0, 0.0, 0.045);
  return g;
}
// 전기충격기: 검은 손잡이, 앞(+Y 쪽 끝)에 전극 둘
export function stunGun() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.05), M(0x111113, 0.6));
  body.position.y = 0.03; g.add(body);
  for (const x of [-0.011, 0.011]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.018, 8), M(0xcccccc, 0.2, 1)); e.position.set(x, 0.114, 0); g.add(e); }
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.006), M(0xb02020, 0.5)); btn.position.set(0, 0.04, -0.028); g.add(btn);
  const spark = new THREE.PointLight(0x9fc8ff, 0, 0.8, 2); spark.position.y = 0.13; g.add(spark);
  const arc = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0 }));
  arc.position.y = 0.125; g.add(arc);
  g.userData.zap = (on) => { spark.intensity = on ? 3 + Math.random() * 4 : 0; arc.material.opacity = on ? 0.9 : 0; arc.scale.setScalar(on ? 0.6 + Math.random() : 1); };
  g.position.set(0, -0.02, 0.03);
  return shadow(g);
}
// 공구함(바닥에 둔다): 뚜껑을 열면 펜치·드라이버·망치가 보인다
export function toolbox() {
  const g = new THREE.Group();
  const red = M(0x8e1d18, 0.45, 0.3);
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.2, 0.24), red); box.position.y = 0.1; g.add(box);
  const lid = new THREE.Group(); const l = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.03, 0.24), red); l.position.z = -0.12; lid.add(l); lid.position.set(0, 0.2, 0.12); lid.rotation.x = -1.9; g.add(lid);
  const steel = M(0x9a9a9a, 0.3, 0.9), grip = M(0xd88a1a, 0.6);
  const hammer = new THREE.Group(); const hh = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 10), grip); hh.rotation.z = Math.PI / 2; const hd = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.1), steel); hd.position.x = 0.15; hammer.add(hh, hd); hammer.position.set(-0.05, 0.215, -0.03); hammer.rotation.y = 0.2; g.add(hammer);
  const pl = new THREE.Group(); for (const s of [-1, 1]) { const a = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.012), grip); a.rotation.y = s * 0.12; a.position.x = 0.05; const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.012), steel); b.position.x = -0.05; b.rotation.y = -s * 0.05; pl.add(a, b); } pl.position.set(0.1, 0.215, 0.05); g.add(pl);
  const sd = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.16, 8), steel); sd.rotation.z = Math.PI / 2; sd.position.set(0.0, 0.212, 0.08); g.add(sd);
  return shadow(g);
}
// 종이(이혼 서류): 캔버스에 글씨
export function paper(title = '협의이혼의사확인신청서') {
  const c = document.createElement('canvas'); c.width = 420; c.height = 594;
  const x = c.getContext('2d');
  const labels = ['성명', '주민등록번호', '주소', '등록기준지', '혼인신고일', '자녀', '친권자', '양육비', '위자료', '재산분할', '협의일', '서명'];
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    if (img) x.drawImage(img, 0, 0, 420, 594);
    else { x.fillStyle = '#f2f1ee'; x.fillRect(0, 0, 420, 594); x.strokeStyle = '#555'; x.lineWidth = 1; x.strokeRect(19, 36, 382, 525); }
    x.fillStyle = '#1d1d1d'; x.font = 'bold 19px serif'; x.textAlign = 'center'; x.fillText(title, 210, 26);
    // 양식 칸(그림 기준 420px 폭): 열 경계 x=19·110·308·401, 첫 줄 y=36~68, 이후 41.1px 간격 12줄
    x.font = 'bold 12px serif'; x.textAlign = 'center';
    [['항목', 64], ['내용', 209], ['확인', 355]].forEach(([s, cx]) => x.fillText(s, cx, 56));
    x.font = '13px serif';
    labels.forEach((s, i) => x.fillText(s, 64, 93 + i * 41.1));
    x.strokeStyle = '#b22'; x.lineWidth = 2; x.beginPath(); x.arc(355, 540, 13, 0, Math.PI * 2); x.stroke();
    t.needsUpdate = true;
  };
  const img = formImg();
  if (img.complete && img.naturalWidth) draw(img); else { draw(null); img.addEventListener('load', () => draw(img), { once: true }); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  const g = new THREE.Group(); m.position.y = 0.11; m.position.z = 0.005; g.add(m);
  return shadow(g);
}
// 소주병
export function bottle() {
  const g = new THREE.Group();
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x3d9a5a, roughness: 0.1, transmission: 0.6, thickness: 0.01, transparent: true, opacity: 0.85 });
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.14, 20), glass); b.position.y = -0.02;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 0.06, 20), glass); neck.position.y = 0.08;
  const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0325, 0.0325, 0.06, 20, 1, true), M(0xf2f2ea, 0.8)); lab.position.y = -0.02;
  g.add(b, neck, lab); g.position.set(0, 0, 0.04);
  return shadow(g);
}
// 숟가락과 밥
export function spoon() {
  const g = new THREE.Group();
  const steel = M(0xd0d0d0, 0.2, 1);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.16, 0.003), steel); h.position.y = 0.0; g.add(h);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel); bowl.scale.set(1, 0.35, 1.4); bowl.rotation.x = Math.PI / 2; bowl.position.y = 0.09; g.add(bowl);
  const rice = new THREE.Mesh(new THREE.SphereGeometry(0.017, 12, 8), M(0xf4f1ea, 0.9)); rice.scale.set(1, 0.6, 1.2); rice.position.set(0, 0.09, 0.006); g.add(rice); g.userData.rice = rice;
  g.rotation.x = -0.4; g.position.set(0, 0, 0.012);
  return shadow(g);
}
// 아끼는 물건: 시계(남편판) / 반지 상자(아내판)를 손에 든다
export function keepsake(kind = 'watch') {
  const g = new THREE.Group();
  if (kind === 'watch') {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 28), M(0xc9b37a, 0.25, 1)); face.rotation.x = Math.PI / 2;
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.017, 28), M(0xf4f0e2, 0.3)); glass.position.z = 0.0042;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 24, Math.PI * 1.4), M(0x3b2416, 0.7)); strap.rotation.z = Math.PI * 0.8; strap.position.z = -0.01;
    g.add(face, glass, strap);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), M(0x5a1424, 0.8)); g.add(box);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.002, 8, 20), M(0xe6c97a, 0.2, 1)); ring.position.y = 0.024; g.add(ring);
  }
  g.position.set(0, 0.03, 0.03);
  return shadow(g);
}
// 녹음 중인 폰(식탁 끝에 세워 둠)
export function recorder() {
  const g = phone();
  g.userData.setGlow(true, 0x2a0b0b);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  dot.position.set(0, 0.04, -0.0045); dot.rotation.y = Math.PI; g.add(dot);
  g.userData.dot = dot;
  return g;
}
// 눈가리개(머리 뼈에 붙인다)
export function blindfold() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.1, 0.045, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 1, metalness: 0, envMapIntensity: 0, side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}
// 물보라(짧은 입자)
export function splash(scene, at, dir) {
  const n = 160, geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    pos.set([at.x, at.y, at.z], i * 3);
    vel.push(new THREE.Vector3(dir.x + (Math.random() - 0.5) * 1.2, dir.y + Math.random() * 0.9, dir.z + (Math.random() - 0.5) * 1.2).multiplyScalar(1.4 + Math.random() * 1.6));
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfe2f5, size: 0.012, transparent: true, opacity: 0.8 }));
  scene.add(pts);
  let life = 0;
  return (dt) => {
    life += dt;
    for (let i = 0; i < n; i++) { vel[i].y -= 9.8 * dt; pos[i * 3] += vel[i].x * dt; pos[i * 3 + 1] += vel[i].y * dt; pos[i * 3 + 2] += vel[i].z * dt; if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 0; }
    geo.attributes.position.needsUpdate = true;
    pts.material.opacity = Math.max(0, 0.8 - life * 0.8);
    if (life > 1.1) { scene.remove(pts); geo.dispose(); return false; }
    return true;
  };
}
// 깨진 조각(바닥으로 흩어짐)
export function shards(scene, at, color = 0xc9b37a) {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(new THREE.TetrahedronGeometry(0.006 + Math.random() * 0.01), M(color, 0.3, 0.8));
    m.position.copy(at); m.castShadow = true; scene.add(m);
    parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.5, (Math.random() - 0.5) * 2), r: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0) });
  }
  return (dt) => {
    for (const p of parts) {
      if (p.m.position.y <= 0.004) { p.v.set(0, 0, 0); continue; }
      p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += p.r.x * dt; p.m.rotation.y += p.r.y * dt;
      if (p.m.position.y < 0.004) p.m.position.y = 0.004;
    }
    return true;
  };
}

// 가위: 손잡이는 손 안, 날은 손가락 방향(+Y)으로
export function scissors() {
  const g = new THREE.Group();
  const steel = M(0xc8c8c8, 0.25, 1), grip = M(0x1d1d22, 0.6);
  for (const s of [-1, 1]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.002), steel); blade.position.set(s * 0.004, 0.07, 0); blade.rotation.z = s * 0.08; g.add(blade);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 8, 16), grip); ring.position.set(s * 0.012, -0.005, 0); g.add(ring);
  }
  g.position.set(0, 0.0, 0.02);
  return shadow(g);
}
