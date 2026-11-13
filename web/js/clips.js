// 행동별 팔 동작(클립). 위치·방향은 카메라 틀 [오른쪽, 위, 앞(상대 쪽)](m). at 은 월드 점을 돌려주는 함수.
// 클립마다 view(카메라 자리)를 정한다. 사건(ev)은 시각 t 에 한 번 불린다. 숫자는 스크린샷으로 확인해 정한 설계 판단.
import * as THREE from 'three';
import * as P from './props.js';
import { SFX } from './audio.js';

export function makeClips(X) {
  const { H, A, scene, fx } = X; // fx: main 이 주는 화면 효과(flash·shake·tick 등록)
  const at = (name, add = [0, 0, 0]) => () => { const v = H.point(name); v.y += add[1]; v.x += add[0]; v.z += add[2]; return v; };
  const holding = { r: null, l: null };
  const hold = (side, obj) => { drop(side); A.grips[side].add(obj); holding[side] = obj; return obj; };
  function drop(side) { const o = holding[side]; if (o) { o.parent.remove(o); holding[side] = null; } return o; }
  // 손에 든 물건을 월드에 놓는다(지금 자리 그대로)
  const release = (side) => { const o = holding[side]; if (!o) return null; o.updateMatrixWorld(true); const m = o.matrixWorld.clone(); o.parent.remove(o); holding[side] = null; scene.add(o); m.decompose(o.position, o.quaternion, o.scale); return o; };
  const G = { up: [0, 1, 0.15], fwd: [0, 0.15, 1], down: [0, -1, 0.2] };
  const N = { left: [-1, 0, 0], right: [1, 0, 0], away: [0, 0, 1], toMe: [0, 0, -1], up: [0, 1, 0], down: [0, -1, 0] };

  const C = {};
  C.gesture = () => ({ view: 'base', dur: 0.9, r: [{ t: 0.3, p: [0.14, -0.22, 0.34], g: [0.05, 0.4, 1], n: N.left, curl: 0.55 }, { t: 0.65, p: [0.15, -0.2, 0.36], g: [0.05, 0.4, 1], n: N.left, curl: 0.55 }, { t: 0.9, p: [0.24, -0.5, 0.18], g: G.down, n: N.left, curl: 0.35 }] });
  C.slap = (hard = false) => {
    const k = hard ? 1.25 : 1;
    const tc = hard ? 0.62 : 0.45;
    return {
      view: 'near', dur: tc + 0.6,
      r: [
        { t: 0.05, p: [0.3, -0.28, 0.22], g: [0.1, 0.9, 0.3], n: [-0.6, 0, 0.6], curl: 0.15 },
        { t: tc - 0.16, p: [0.44 * k, 0.02, 0.22], g: [0.35, 0.9, 0.15], n: [-0.95, 0, 0.2], curl: 0.05, ease: 'out' },
        { t: tc, at: at('cheekL'), p: [0.045, -0.01, 0.0], g: [0.1, 1, 0.35], n: [-1, 0, 0.1], curl: 0.05, ease: 'in' },
        { t: tc + 0.14, at: at('cheekL'), p: [-0.16, -0.06, -0.08], g: [-0.3, 0.9, 0.3], n: [-0.8, 0, -0.4], curl: 0.2, ease: 'out' },
        { t: tc + 0.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left, curl: 0.35 },
      ],
      ev: [{ t: tc, fn: () => { (hard ? SFX.slapHard : SFX.slap)(); H.react('slap', hard ? 1.7 : 1); H.slapMark('L', hard ? 0.6 : 0.35); H.setExpr('hurt_reflex'); fx.flash(hard ? 0.18 : 0.08); fx.shake(hard ? 0.018 : 0.008); } }, { t: tc - 0.2, fn: SFX.whoosh }],
    };
  };
  C.hair = () => ({
    view: 'near', dur: 2.4,
    r: [
      { t: 0.35, at: at('head', [0.0, 0.2, 0.02]), p: [0, 0.03, 0], g: [0, 0.2, 1], n: N.down, curl: 0.15 },
      { t: 0.6, at: at('head', [0.0, 0.17, 0.0]), p: [0, 0, 0], g: [0, 0.2, 1], n: N.down, curl: 0.95, thumb: 0.8 },
      { t: 0.85, at: at('head', [0.0, 0.17, 0.0]), p: [0, 0.03, -0.03], g: [0, 0.4, 1], n: N.down, curl: 0.95, thumb: 0.8 },
      { t: 1.9, at: at('head', [0.0, 0.17, 0.0]), p: [0, 0.03, -0.03], g: [0, 0.4, 1], n: N.down, curl: 0.95, thumb: 0.8 },
      { t: 2.4, p: [0.26, -0.55, 0.15], g: G.down, n: N.left },
    ],
    ev: [{ t: 0.62, fn: () => { H.setHeadGoal(0, -0.35, 0); H.react('flinch', 0.6); SFX.thud(); } }, { t: 2.0, fn: () => H.setHeadGoal(0, 0, 0) }],
  });
  C.water = () => {
    let c;
    return {
      view: 'base', dur: 1.7,
      r: [
        { t: 0.3, p: [0.16, -0.3, 0.3], g: [0, 0.3, 1], n: N.left, curl: 0.75 },
        { t: 0.8, p: [0.12, -0.08, 0.42], g: [0, 0.3, 1], n: N.left, curl: 0.75 },
        { t: 1.0, p: [0.06, 0.0, 0.46], g: [0, 0.2, 1], n: N.up, curl: 0.75, ease: 'snap' },
        { t: 1.7, p: [0.26, -0.55, 0.15], g: G.down, n: N.left, curl: 0.4 },
      ],
      ev: [
        { t: 0, fn: () => { c = hold('r', P.cup()); } },
        { t: 0.95, fn: () => { const from = new THREE.Vector3(); c.getWorldPosition(from); const face = H.point('eyes'); fx.tick(P.splash(scene, from, face.sub(from).normalize().multiplyScalar(1.4))); SFX.splash(); c.userData.water.visible = false; setTimeout(() => { H.wet(1); H.react('flinch', 1.2); H.setExpr('afraid'); }, 120); } },
        { t: 1.55, fn: () => drop('r') },
      ],
    };
  };
  const ropeHands = (pull) => ({
    view: 'rope', dur: 1.9,
    r: [
      { t: 0.45, at: () => H.wristMid().add(new THREE.Vector3(0.02, 0.2, 0.02)), p: [0, 0, 0], g: [0, 1, 0], n: N.left, curl: 0.2 },
      { t: 0.6, at: () => H.wristMid().add(new THREE.Vector3(0.02, 0.2, 0.02)), p: [0, 0, 0], g: [0, 1, 0], n: N.left, curl: 0.95, thumb: 0.9 },
      { t: 1.3, at: () => H.wristMid().add(new THREE.Vector3(0.02, 0.2, 0.02)), p: [0, pull ? -0.04 : 0.03, 0], g: [0, 1, 0], n: N.left, curl: 0.95, thumb: 0.9 },
      { t: 1.9, p: [0.26, -0.55, 0.15], g: G.down, n: N.left },
    ],
    l: [
      { t: 0.5, at: () => H.wristMid().add(new THREE.Vector3(-0.02, 0.32, 0.02)), p: [0, 0, 0], g: [0, 1, 0], n: N.right, curl: 0.2 },
      { t: 0.65, at: () => H.wristMid().add(new THREE.Vector3(-0.02, 0.32, 0.02)), p: [0, 0, 0], g: [0, 1, 0], n: N.right, curl: 0.95, thumb: 0.9 },
      { t: 1.3, at: () => H.wristMid().add(new THREE.Vector3(-0.02, 0.32, 0.02)), p: [0, pull ? -0.04 : 0.03, 0], g: [0, 1, 0], n: N.right, curl: 0.95, thumb: 0.9 },
      { t: 1.9, p: [-0.26, -0.55, 0.15], g: G.down, n: N.right },
    ],
  });
  C.tighten = (v) => ({ ...ropeHands(true), ev: [{ t: 0.9, fn: () => { H.state.tension = v; SFX.rope(); SFX.creak(); H.react('flinch', 0.8); H.setExpr('pained'); } }] });
  C.loosen = (v) => ({ ...ropeHands(false), ev: [{ t: 0.9, fn: () => { H.state.tension = v; SFX.rope(); H.setExpr('relieved'); } }] });
  C.blindOn = () => ({
    view: 'near', dur: 1.8,
    r: [{ t: 0.5, at: at('eyes', [0, 0, 0]), p: [0.1, 0, 0.0], g: [0, 1, 0.2], n: N.left, curl: 0.3 }, { t: 1.1, at: at('eyes'), p: [0.11, 0, 0.02], g: [0, 1, 0.2], n: N.left, curl: 0.3 }, { t: 1.8, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    l: [{ t: 0.5, at: at('eyes'), p: [-0.1, 0, 0.0], g: [0, 1, 0.2], n: N.right, curl: 0.3 }, { t: 1.1, at: at('eyes'), p: [-0.11, 0, 0.02], g: [0, 1, 0.2], n: N.right, curl: 0.3 }, { t: 1.8, p: [-0.26, -0.55, 0.15], g: G.down, n: N.right }],
    ev: [{ t: 0.9, fn: () => { X.setBlind(true); SFX.paper(); H.react('flinch', 0.5); } }],
  });
  C.blindOff = () => ({ ...C.blindOn(), ev: [{ t: 0.9, fn: () => { X.setBlind(false); SFX.paper(); } }] });
  C.tools = () => ({
    view: 'low', dur: 1.8,
    r: [{ t: 0.6, p: [0.12, -0.55, 0.5], g: [0, -0.6, 1], n: N.down, curl: 0.8 }, { t: 1.1, p: [0.12, -0.55, 0.5], g: [0, -0.6, 1], n: N.down, curl: 0.3 }, { t: 1.8, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    ev: [{ t: 0.95, fn: () => { X.placeToolbox(); SFX.thud(); SFX.metal(); H.setExpr('afraid'); } }],
  });
  C.shock = () => {
    let g;
    const chest = () => { const v = H.point('spine_03'); v.y -= 0.02; return v; };
    return {
      view: 'chest', dur: 2.6,
      r: [
        { t: 0.4, p: [0.16, -0.32, 0.3], g: [0, 0.2, 1], n: N.left, curl: 0.8 },
        { t: 0.75, at: chest, p: [0.06, 0, -0.27], g: [0, 0.1, 1], n: N.left, curl: 0.8 },
        { t: 2.0, at: chest, p: [0.06, 0, -0.27], g: [0, 0.1, 1], n: N.left, curl: 0.8 },
        { t: 2.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left, curl: 0.4 },
      ],
      ev: [
        { t: 0, fn: () => { g = hold('r', P.stunGun()); } },
        { t: 0.78, fn: () => { SFX.zap(1.2); SFX.scream(true); H.state.shock = 1.2; H.setExpr('pained'); fx.shake(0.01); let tt = 0; fx.tick((dt) => { tt += dt; if (!g.parent) return false; g.userData.zap(tt < 1.2 && Math.random() < 0.7); fx.lamp(tt < 1.2 ? 0.6 + Math.random() * 0.5 : 1); return tt < 1.25; }); } },
        { t: 2.4, fn: () => drop('r') },
      ],
    };
  };
  C.smash = (kind) => {
    let o;
    return {
      view: 'base', dur: 2.6,
      r: [
        { t: 0.5, at: at('face0'), p: [0.03, -0.06, -0.1], g: [0, 1, 0.1], n: N.away, curl: 0.7 },
        { t: 1.5, at: at('face0'), p: [0.03, -0.06, -0.1], g: [0, 1, 0.1], n: N.away, curl: 0.7 },
        { t: 1.85, p: [0.2, 0.18, 0.3], g: [0, 1, -0.2], n: N.toMe, curl: 0.7, ease: 'out' },
        { t: 2.05, p: [0.12, -0.5, 0.45], g: [0, -0.4, 1], n: N.down, curl: 0.2, ease: 'snap' },
        { t: 2.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left },
      ],
      ev: [
        { t: 0, fn: () => { o = hold('r', P.keepsake(kind)); } },
        { t: 2.0, fn: () => { const w = release('r'); const p = w.position.clone(); scene.remove(w); p.y = 0.05; fx.tick(P.shards(scene, p, kind === 'watch' ? 0xc9b37a : 0xe6c97a)); SFX.smash(); H.react('flinch', 1); H.setExpr('crying'); } },
      ],
    };
  };
  C.divorce = () => {
    return {
      view: 'base', dur: 3.0,
      r: [{ t: 0.6, at: at('face0'), p: [0.05, -0.16, 0.1], g: [0, 1, 0], n: N.toMe, curl: 0.55, thumb: 0.9 }, { t: 2.5, at: at('face0'), p: [0.05, -0.16, 0.1], g: [0, 1, 0], n: N.toMe, curl: 0.55, thumb: 0.9 }, { t: 3.0, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
      ev: [{ t: 0, fn: () => hold('r', P.paper()) }, { t: 0.5, fn: SFX.paper }, { t: 2.8, fn: () => drop('r') }],
    };
  };
  C.call = () => ({
    view: 'base', dur: 3.2,
    r: [{ t: 0.6, p: [0.11, -0.02, 0.0], g: [0, 1, 0.25], n: N.left, curl: 0.6 }, { t: 2.7, p: [0.11, -0.02, 0.0], g: [0, 1, 0.25], n: N.left, curl: 0.6 }, { t: 3.2, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    ev: [{ t: 0, fn: () => { const p = hold('r', P.phone()); p.userData.setGlow(true); } }, { t: 0.7, fn: SFX.dial }, { t: 3.0, fn: () => drop('r') }],
  });
  C.phoneHold = () => ({
    view: 'base', dur: 0.7, hold: true,
    r: [{ t: 0.6, p: [0.05, -0.16, 0.3], g: [0, 1, 0.3], n: N.away, curl: 0.6, thumb: 0.5 }],
    ev: [{ t: 0, fn: () => { const p = hold('r', P.phone()); p.userData.setGlow(true); } }],
  });
  C.phoneDown = () => ({ view: 'base', dur: 0.6, r: [{ t: 0.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }], ev: [{ t: 0.4, fn: () => drop('r') }] });
  C.showPhone = () => ({
    view: 'base', dur: 2.4,
    r: [{ t: 0.5, at: at('face0'), p: [0.03, -0.05, -0.08], g: [0, 1, 0], n: N.toMe, curl: 0.6, thumb: 0.5 }, { t: 2.0, at: at('face0'), p: [0.03, -0.05, -0.08], g: [0, 1, 0], n: N.toMe, curl: 0.6, thumb: 0.5 }, { t: 2.4, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    ev: [{ t: 0, fn: () => { const p = hold('r', P.phone()); p.userData.setGlow(true); } }, { t: 2.2, fn: () => drop('r') }],
  });
  C.feed = () => {
    let s;
    return {
      view: 'near', dur: 2.2,
      r: [{ t: 0.5, p: [0.1, -0.2, 0.3], g: [0, 0.3, 1], n: N.left, curl: 0.7 }, { t: 1.0, at: at('mouth'), p: [0.0, -0.02, -0.11], g: [0, 0.15, 1], n: N.left, curl: 0.7 }, { t: 1.5, at: at('mouth'), p: [0.0, -0.02, -0.12], g: [0, 0.15, 1], n: N.left, curl: 0.7 }, { t: 2.2, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
      ev: [{ t: 0, fn: () => { s = hold('r', P.spoon()); } }, { t: 1.1, fn: () => { s.userData.rice.visible = false; SFX.gulp(); } }, { t: 2.0, fn: () => drop('r') }],
    };
  };
  C.drink = () => ({
    view: 'near', dur: 2.6,
    r: [{ t: 0.5, p: [0.1, -0.2, 0.3], g: [0, 0.6, 0.8], n: N.left, curl: 0.8 }, { t: 1.0, at: at('mouth'), p: [0.02, 0.02, -0.13], g: [0, -0.35, 1], n: N.left, curl: 0.8 }, { t: 1.9, at: at('mouth'), p: [0.02, 0.03, -0.13], g: [0, -0.55, 1], n: N.left, curl: 0.8 }, { t: 2.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    ev: [{ t: 0, fn: () => hold('r', P.bottle()) }, { t: 1.1, fn: SFX.gulp }, { t: 2.4, fn: () => drop('r') }],
  });
  C.recordOn = () => ({
    view: 'base', dur: 2.2,
    r: [{ t: 0.5, at: at('face0'), p: [0.03, -0.1, -0.08], g: [0, 1, 0], n: N.toMe, curl: 0.6 }, { t: 1.3, at: at('face0'), p: [0.03, -0.1, -0.08], g: [0, 1, 0], n: N.toMe, curl: 0.6 }, { t: 2.2, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    ev: [{ t: 0, fn: () => hold('r', P.recorder()) }, { t: 0.6, fn: SFX.tape }, { t: 1.5, fn: () => { drop('r'); X.placeRecorder(true); } }],
  });
  C.recordOff = () => ({ ...C.gesture(), ev: [{ t: 0.4, fn: () => { X.placeRecorder(false); SFX.tape(); } }] });
  C.cry = () => ({
    view: 'base', dur: 2.6,
    r: [{ t: 0.6, p: [0.035, -0.03, 0.11], g: [0, 1, 0.1], n: N.toMe, curl: 0.4 }, { t: 2.0, p: [0.03, -0.05, 0.12], g: [0, 1, 0.1], n: N.toMe, curl: 0.45 }, { t: 2.6, p: [0.26, -0.55, 0.15], g: G.down, n: N.left }],
    l: [{ t: 0.7, p: [-0.035, -0.03, 0.11], g: [0, 1, 0.1], n: N.toMe, curl: 0.4 }, { t: 2.0, p: [-0.03, -0.05, 0.12], g: [0, 1, 0.1], n: N.toMe, curl: 0.45 }, { t: 2.6, p: [-0.26, -0.55, 0.15], g: G.down, n: N.right }],
    ev: [{ t: 0.6, fn: SFX.sob }, { t: 1.4, fn: SFX.sob }],
  });
  C.release = drop;
  return C;
}
