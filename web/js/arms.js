// 묻는 쪽의 팔(1인칭이라 화면에는 팔만 보인다). 팔 모델을 카메라에 붙이고, 손목 목표·손 방향·손가락 굽힘을 키로 움직인다.
// 키의 위치와 방향은 카메라 틀 [오른쪽, 위, 앞(상대 쪽)](m). at 이 있으면 그 월드 점(함수)에 더한다.
//   { t, p:[r,u,f], at?: () => Vector3, g:[손가락 방향], n:[손바닥이 향하는 쪽], curl, thumb, ease }
// 클립: { dur, r:[키…], l:[키…], ev:[{ t, fn }] }. 키가 없는 손은 쉬는 자리(화면 밖 아래)로.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { V3, captureRest, aim, twoBone, setWorldQ, clamp, smooth, lerp } from './rig.js';
import { vq } from './version.js';

export const REST = {
  r: { p: [0.26, -0.62, 0.12], g: [0.1, -1, 0.3], n: [-1, 0, 0], curl: 0.35 },
  l: { p: [-0.26, -0.62, 0.12], g: [-0.1, -1, 0.3], n: [1, 0, 0], curl: 0.35 },
};
const EASE = { lin: (u) => u, in: (u) => u * u, out: (u) => 1 - (1 - u) * (1 - u), io: smooth, snap: (u) => 1 - Math.pow(1 - u, 4) };

export async function loadArms(scene, camera, { url = './assets/wife.glb', envTex = null, ring = true } = {}) {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(vq(url));
  const root = gltf.scene;
  scene.add(root);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      if (/^body\./.test(o.material.name)) { o.material.roughness = 0.55; }
      if (envTex) { o.material.envMap = envTex; o.material.envMapIntensity = 0.5; }
    }
  });
  const rest = captureRest(root, bones);
  // 어깨 중심(쉬는 자세)과 손 틀
  const shoulderMid = rest.clavicle_l.p.clone().add(rest.clavicle_r.p).multiplyScalar(0.5);
  const hands = {};
  for (const s of ['l', 'r']) {
    const P = (n) => rest[`${n}_${s}`].p;
    const g = P('middle_01').clone().sub(rest[`hand_${s}`].p).normalize();
    const across = P('index_01').clone().sub(P('pinky_01'));
    const n = (s === 'l' ? g.clone().cross(across) : across.clone().cross(g)).normalize();
    const curlAxis = {};
    for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) for (const k of ['01', '02', '03']) {
      const b = `${f}_${k}_${s}`; if (!rest[b]) continue;
      const nn = f === 'thumb' ? n.clone().addScaledVector(across.clone().normalize(), -0.6).normalize() : n;
      curlAxis[b] = rest[b].dir.clone().cross(nn).normalize().applyQuaternion(rest[b].q.clone().invert());
    }
    const palm = rest[`hand_${s}`].p.clone().lerp(P('middle_01'), 0.55).addScaledVector(n, 0.012);
    hands[s] = { g, n, across: across.normalize(), curlAxis, palmOff: palm.sub(rest[`hand_${s}`].p).applyQuaternion(rest[`hand_${s}`].q.clone().invert()) };
  }
  // 반지(왼손 약지)
  if (ring && bones.ring_01_l) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0095, 0.0018, 8, 24), new THREE.MeshStandardMaterial({ color: 0xe6c97a, metalness: 1, roughness: 0.2 }));
    r.rotation.x = Math.PI / 2; r.position.y = 0.012; bones.ring_01_l.add(r);
  }
  // 손에 쥐는 자리(grip): Y=손가락 방향, Z=손바닥이 향하는 쪽, X=Y×Z. 원점은 손바닥 중심
  const grips = {};
  for (const s of ['l', 'r']) {
    const gObj = new THREE.Object3D();
    const h = hands[s];
    const m = new THREE.Matrix4().makeBasis(h.g.clone().cross(h.n).normalize(), h.g, h.n); // X=Y×Z
    const qWorld = new THREE.Quaternion().setFromRotationMatrix(m);
    gObj.quaternion.copy(rest[`hand_${s}`].q.clone().invert().multiply(qWorld));
    gObj.position.copy(h.palmOff);
    bones[`hand_${s}`].add(gObj);
    grips[s] = gObj;
  }

  const A = { root, bones, rest, grips, hands, clip: null, t: 0, cur: { r: { ...REST.r }, l: { ...REST.l } }, shake: 0 };
  const camQ = new THREE.Quaternion(), camP = V3();
  const toWorldDir = (v) => V3(v[0], v[1], -v[2]).applyQuaternion(camQ); // 카메라 틀(앞 = -Z)
  const toWorldPos = (v) => V3(v[0], v[1], -v[2]).applyQuaternion(camQ).add(camP);

  function setCurl(s, curl, thumb) {
    for (const [b, ax] of Object.entries(hands[s].curlAxis)) {
      const isThumb = b.startsWith('thumb');
      const k = b.includes('_01_') ? (isThumb ? 0.2 : 0.9) : b.includes('_02_') ? 1.1 : 0.8;
      const a = (isThumb ? thumb : curl) * k * 1.25;
      bones[b].quaternion.copy(rest[b].localQ).multiply(new THREE.Quaternion().setFromAxisAngle(ax, a));
    }
  }
  // 쉬는 자세 값은 모델 원점 기준으로 재 두었으므로, 지금 원점의 회전을 곱해 월드로 바꾼다
  const RW = (n) => { const r = rest[n], rq = root.quaternion; return { q: rq.clone().multiply(r.q), dir: r.dir.clone().applyQuaternion(rq), len: r.len }; };
  function aimHand(s, g1, n1) {
    const hd = hands[s], h = bones[`hand_${s}`], rh = RW(`hand_${s}`);
    const rq = root.quaternion;
    const g0 = hd.g.clone().applyQuaternion(rq), n0 = hd.n.clone().applyQuaternion(rq);
    const m0 = new THREE.Matrix4().makeBasis(g0, n0, g0.clone().cross(n0).normalize());
    const n1o = n1.clone().addScaledVector(g1, -n1.dot(g1)).normalize();
    const m1 = new THREE.Matrix4().makeBasis(g1, n1o, g1.clone().cross(n1o).normalize());
    setWorldQ(h, new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.invert())).multiply(rh.q.clone()));
  }
  // 키 사이를 보간한 현재 목표
  function sample(keys, side, t) {
    if (!keys || !keys.length) return { ...REST[side], world: null };
    let i = 0; while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    const u = b === a || b.t === a.t ? 1 : clamp((t - a.t) / (b.t - a.t));
    const e = (EASE[b.ease] || EASE.io)(t < a.t ? 0 : u);
    const pos = (k) => (k.at ? k.at().add(toWorldDir(k.p || [0, 0, 0])) : toWorldPos(k.p || REST[side].p));
    const pa = pos(a), pb = pos(b);
    const mix = (x, y) => [lerp(x[0], y[0], e), lerp(x[1], y[1], e), lerp(x[2], y[2], e)];
    return { world: pa.lerp(pb, e), g: mix(a.g || REST[side].g, b.g || REST[side].g), n: mix(a.n || REST[side].n, b.n || REST[side].n), curl: lerp(a.curl ?? REST[side].curl, b.curl ?? REST[side].curl, e), thumb: lerp(a.thumb ?? (a.curl ?? 0.35) * 0.7, b.thumb ?? (b.curl ?? 0.35) * 0.7, e), hide: a.hide && b.hide };
  }

  A.play = (clip) => new Promise((res) => {
    // 시작할 때 지금 손 위치에서 이어지도록 0초 키를 앞에 붙인다
    const from = (s) => ({ t: 0, p: A.cur[s].pCam, g: A.cur[s].g, n: A.cur[s].n, curl: A.cur[s].curl });
    const prep = (s) => { const k = clip[s]; if (!k) return [from(s), { t: Math.min(0.35, clip.dur), ...REST[s] }]; return k[0].t > 0 ? [from(s), ...k] : k; };
    A.clip = { ...clip, r: prep('r'), l: prep('l'), done: res, fired: new Set() };
    A.t = 0;
  });
  A.stop = () => { if (A.clip) { const d = A.clip.done; A.clip = null; d(); } };

  A.update = (dt) => {
    camera.updateMatrixWorld(true);
    camera.getWorldQuaternion(camQ); camera.getWorldPosition(camP);
    // 몸을 카메라 아래·뒤에(어깨가 눈 아래 18cm, 4cm 뒤)
    root.quaternion.copy(camQ).multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), Math.PI));
    const want = toWorldPos([0, -0.2, -0.06]);
    root.position.copy(want).sub(shoulderMid.clone().applyQuaternion(root.quaternion));
    for (const n of Object.keys(bones)) { bones[n].quaternion.copy(rest[n].localQ); bones[n].position.copy(rest[n].localP); }
    root.updateMatrixWorld(true);
    let tgt;
    if (A.clip) {
      A.t += dt;
      for (const e of A.clip.ev || []) if (A.t >= e.t && !A.clip.fired.has(e)) { A.clip.fired.add(e); try { e.fn(); } catch (err) { console.error(err); } }
      tgt = { r: sample(A.clip.r, 'r', A.t), l: sample(A.clip.l, 'l', A.t) };
      if (A.t >= A.clip.dur) {
        const keepR = A.clip.hold ? A.clip.r : null, keepL = A.clip.hold ? A.clip.l : null;
        const d = A.clip.done; A.clip = keepR ? { dur: Infinity, r: keepR, l: keepL, done: () => {}, fired: new Set(), ev: [] } : null; if (A.clip) A.t = 1e6; d();
      }
    } else tgt = { r: sample(null, 'r', 0), l: sample(null, 'l', 0) };
    for (const s of ['r', 'l']) {
      const T = tgt[s];
      const w = T.world || toWorldPos(T.p);
      if (A.shake > 0) w.add(V3((Math.random() - 0.5) * A.shake, (Math.random() - 0.5) * A.shake, 0));
      // 카메라 틀의 값을 기억(다음 클립의 시작점)
      const inv = camQ.clone().invert();
      const pc = w.clone().sub(camP).applyQuaternion(inv);
      A.cur[s] = { pCam: [pc.x, pc.y, -pc.z], g: T.g, n: T.n, curl: T.curl };
      const sx = s === 'r' ? 1 : -1;
      // 손목은 손바닥 중심보다 조금 뒤(손가락 반대쪽)
      const g = toWorldDir(T.g).normalize(), n = toWorldDir(T.n).normalize();
      const wrist = w.clone().addScaledVector(g, -0.07).addScaledVector(n, -0.015);
      twoBone(bones[`upperarm_${s}`], bones[`lowerarm_${s}`], RW(`upperarm_${s}`), RW(`lowerarm_${s}`), wrist, toWorldDir([sx * 0.8, -0.6, -0.1]));
      root.updateMatrixWorld(true);
      aimHand(s, g, n);
      setCurl(s, T.curl, T.thumb);
    }
    root.updateMatrixWorld(true);
    A.shake = Math.max(0, A.shake - dt * 0.05);
  };
  return A;
}
