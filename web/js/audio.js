// 소리(전부 브라우저에서 만든다. 파일 없음): 효과음·방 소리·배경 음악.
// 브라우저 규칙상 첫 클릭 안에서 unlock() 해야 소리가 난다. 출구(버스)는 se·amb·bgm 셋, 각자 볼륨.
let ctx = null, master = null;
const bus = {};
const vol = { se: 0.9, amb: 0.7, bgm: 0.55 };
let noiseBuf = null;

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createDynamicsCompressor(); master.threshold.value = -14; master.ratio.value = 3; master.connect(ctx.destination);
  for (const k of ['se', 'amb', 'bgm']) { bus[k] = ctx.createGain(); bus[k].gain.value = vol[k]; bus[k].connect(master); }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export const setVolume = (k, v) => { vol[k] = v; if (bus[k]) bus[k].gain.setTargetAtTime(v, ctx.currentTime, 0.05); };
export const volumes = () => ({ ...vol });
export const ready = () => !!ctx;

// ---------- 재료
function noise(dur, { type = 'bandpass', f = 1000, q = 1, gain = 0.5, attack = 0.002, decay = dur, fEnd, to = 'se', at = 0, pan = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(fl); fl.connect(g);
  if (p) { p.pan.value = pan; g.connect(p); p.connect(bus[to]); } else g.connect(bus[to]);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.3, attack = 0.005, decay = dur, fEnd, to = 'se', at = 0, detune = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (fEnd) o.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  o.connect(g); g.connect(bus[to]); o.start(t); o.stop(t + dur + 0.05);
}

// ---------- 효과음
export const SFX = {
  slap: () => { noise(0.12, { type: 'highpass', f: 1800, gain: 0.9, decay: 0.09 }); noise(0.1, { type: 'lowpass', f: 400, gain: 0.5, decay: 0.08 }); },
  slapHard: () => { noise(0.18, { type: 'highpass', f: 1400, gain: 1.2, decay: 0.14 }); noise(0.16, { type: 'lowpass', f: 300, gain: 0.8, decay: 0.12 }); tone(90, 0.15, { gain: 0.4, fEnd: 50 }); },
  whoosh: () => noise(0.25, { type: 'bandpass', f: 500, fEnd: 2500, q: 0.8, gain: 0.25, attack: 0.1, decay: 0.25 }),
  splash: () => { noise(0.6, { type: 'bandpass', f: 2500, fEnd: 800, q: 0.6, gain: 0.8, attack: 0.01, decay: 0.55 }); for (let i = 0; i < 10; i++) noise(0.05, { type: 'highpass', f: 3000 + Math.random() * 3000, gain: 0.2, at: 0.1 + Math.random() * 0.5, decay: 0.04 }); },
  zap: (dur = 1.2) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 58;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 117;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.setValueAtTime(0.25, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(bus.se); o.start(t); o2.start(t); o.stop(t + dur); o2.stop(t + dur);
    for (let i = 0; i < 26; i++) noise(0.02, { type: 'highpass', f: 4000, gain: 0.35, at: Math.random() * dur, decay: 0.015 });
  },
  click: () => noise(0.03, { type: 'highpass', f: 3500, gain: 0.5, decay: 0.02 }),
  creak: () => { tone(180, 0.5, { type: 'sawtooth', gain: 0.05, fEnd: 120, attack: 0.05 }); noise(0.5, { type: 'bandpass', f: 900, q: 6, gain: 0.15, fEnd: 600, attack: 0.05 }); },
  rope: () => { for (let i = 0; i < 4; i++) noise(0.08, { type: 'bandpass', f: 1200 + i * 200, q: 3, gain: 0.25, at: i * 0.07, decay: 0.07 }); },
  thud: () => { tone(70, 0.25, { gain: 0.6, fEnd: 40 }); noise(0.15, { type: 'lowpass', f: 500, gain: 0.4, decay: 0.12 }); },
  metal: () => { for (const f of [820, 1340, 2210]) tone(f, 0.6, { type: 'triangle', gain: 0.07, decay: 0.55 }); noise(0.08, { type: 'highpass', f: 2500, gain: 0.3, decay: 0.05 }); },
  smash: () => { SFX.thud(); for (let i = 0; i < 18; i++) { tone(2500 + Math.random() * 4000, 0.12, { type: 'triangle', gain: 0.06, at: Math.random() * 0.3, decay: 0.1 }); } noise(0.4, { type: 'highpass', f: 2000, gain: 0.5, decay: 0.3 }); },
  paper: () => { for (let i = 0; i < 6; i++) noise(0.06, { type: 'bandpass', f: 3000 + Math.random() * 2000, q: 1, gain: 0.18, at: i * 0.05, decay: 0.05 }); },
  chime: () => { tone(1318, 0.4, { gain: 0.12, decay: 0.35 }); tone(1760, 0.5, { gain: 0.1, at: 0.12, decay: 0.45 }); },
  buzz: () => { for (let i = 0; i < 3; i++) tone(170, 0.18, { type: 'square', gain: 0.04, at: i * 0.25 }); },
  dial: () => { for (let i = 0; i < 2; i++) { tone(440, 1, { gain: 0.06, at: i * 3, decay: 1 }); tone(480, 1, { gain: 0.06, at: i * 3, decay: 1 }); } },
  gulp: () => { for (let i = 0; i < 3; i++) tone(260, 0.1, { gain: 0.15, fEnd: 140, at: i * 0.35 }); },
  wallbang: () => { for (let i = 0; i < 3; i++) { tone(65, 0.2, { gain: 0.7, at: i * 0.32, fEnd: 45 }); noise(0.12, { type: 'lowpass', f: 300, gain: 0.5, at: i * 0.32, decay: 0.1 }); } },
  knock: () => { for (let i = 0; i < 4; i++) { noise(0.06, { type: 'bandpass', f: 700, q: 2, gain: 0.7, at: i * 0.18, decay: 0.05 }); } },
  doorbell: () => { tone(659, 0.6, { gain: 0.15, decay: 0.55 }); tone(523, 0.9, { gain: 0.15, at: 0.55, decay: 0.85 }); },
  siren: () => { if (!ctx) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 2); g.gain.exponentialRampToValueAtTime(0.0001, t + 6); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; for (let i = 0; i < 12; i++) { o.frequency.setValueAtTime(700, t + i * 0.5); o.frequency.linearRampToValueAtTime(1000, t + i * 0.5 + 0.25); } o.connect(f); f.connect(g); g.connect(bus.se); o.start(t); o.stop(t + 6); },
  heartbeat: () => { tone(55, 0.12, { gain: 0.5, fEnd: 40 }); tone(50, 0.12, { gain: 0.35, fEnd: 38, at: 0.22 }); },
  tape: () => { tone(1000, 0.08, { type: 'square', gain: 0.05 }); },
  sob: () => { for (let i = 0; i < 3; i++) noise(0.25, { type: 'bandpass', f: 600, q: 4, gain: 0.08, at: i * 0.4, attack: 0.05, decay: 0.22 }); },
  scream: (big = false) => { // 목소리 대신 거친 숨·신음 같은 질감
    const d = big ? 1.2 : 0.5;
    noise(d, { type: 'bandpass', f: 900, fEnd: 650, q: 3, gain: big ? 0.35 : 0.18, attack: 0.03, decay: d });
    tone(big ? 330 : 240, d, { type: 'sawtooth', gain: big ? 0.05 : 0.025, fEnd: big ? 240 : 190, attack: 0.04 });
  },
};

// ---------- 방 소리: 벽시계 초침, 먼 전철(막차~첫차 사이엔 없음), 아침 새
let ambTimer = null, ambScene = 'night', getMin = () => 22 * 60;
export function ambient(scene, minFn) {
  ambScene = scene; if (minFn) getMin = minFn;
  if (ambTimer || !ctx) return;
  let next = { tick: 0, train: 20, bird: 2 };
  let t0 = performance.now();
  ambTimer = setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const t = (performance.now() - t0) / 1000;
    if (t >= next.tick) { noise(0.012, { type: 'highpass', f: 5000, gain: 0.06, decay: 0.01, to: 'amb', pan: 0.3 }); next.tick = t + 1; }
    const m = getMin() % (24 * 60);
    const trainOK = !(m > 35 && m < 300);
    if (ambScene === 'night' && t >= next.train) {
      if (trainOK) for (let i = 0; i < 8; i++) { noise(0.12, { type: 'lowpass', f: 220, gain: 0.08, at: i * 0.42 + (i % 2) * 0.12, decay: 0.1, to: 'amb', pan: -0.4 }); }
      next.train = t + 70 + Math.random() * 80;
    }
    if (ambScene === 'morning' && t >= next.bird) {
      const b = 2600 + Math.random() * 1400;
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) tone(b, 0.07, { gain: 0.03, fEnd: b * 0.7, at: i * 0.13, to: 'amb' });
      next.bird = t + 1.5 + Math.random() * 4;
    }
  }, 50);
}
export const setAmbient = (scene) => { ambScene = scene; };

// ---------- 배경 음악: 느린 패드(어두운 화음) + 장면별 분위기. 길게 겹치는 음을 정해진 순서로 계속 깐다
const CHORDS = {
  night: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 58], [40, 47, 52, 55]],
  danger: [[44, 51, 56, 59], [44, 50, 56, 62], [43, 50, 55, 61], [44, 51, 54, 59]],
  morning: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59]],
  lonely: [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 63], [45, 52, 57, 60]],
};
let bgmScene = null, bgmTimer = null, bgmStep = 0, duck = 1;
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function pad(notes, dur) {
  const t = ctx.currentTime;
  for (const n of notes) {
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midi(n); o.detune.value = det;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(380, t); f.frequency.linearRampToValueAtTime(bgmScene === 'danger' ? 900 : 650, t + dur * 0.5); f.frequency.linearRampToValueAtTime(380, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.018 * duck, t + dur * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.1);
      o.connect(f); f.connect(g); g.connect(bus.bgm); o.start(t); o.stop(t + dur * 1.15);
    }
  }
  // 아주 작은 피아노 점
  const top = notes[notes.length - 1] + 12 + [0, 2, -1, 3][bgmStep % 4];
  tone(midi(top), 2.5, { type: 'triangle', gain: 0.03 * duck, at: dur * 0.2, to: 'bgm', decay: 2.4 });
}
export function bgm(scene) {
  if (!ctx) { bgmScene = scene; return; }
  bgmScene = scene;
  if (!scene) { clearInterval(bgmTimer); bgmTimer = null; return; }
  if (bgmTimer) return;
  const D = 7;
  const step = () => { if (!bgmScene || ctx.state !== 'running') return; const ch = CHORDS[bgmScene] || CHORDS.night; pad(ch[bgmStep % ch.length], D); bgmStep++; };
  step(); bgmTimer = setInterval(step, D * 1000 * 0.82);
}
export const setDuck = (k) => { duck = k; };
