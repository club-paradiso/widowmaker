// 게임 규칙(화면 없음. 브라우저와 Node 양쪽에서 돈다). 규칙 설명은 SPEC.md. 숫자는 모두 설계 판단.
// newGame(story, seed) → 상태 s.  act(s, 행동, 인자) → 사건 목록.  verdict(s, 판결) → 결말과 답 맞추기.
// 같은 seed 와 같은 행동 순서면 언제나 같은 결과(저장은 seed + 행동 목록만 한다).

export const TELLS = ['lip_press', 'half_smile', 'gaze_drop', 'blink_burst', 'brow_flash', 'lip_roll', 'cheek_puff'];
export const START = 22 * 60;   // 밤 10시(분)
export const MORNING = 31 * 60; // 다음 날 아침 7시
export const MAX_DAYS = 3;
const LATE = 25 * 60;           // 새벽 1시가 지나면 못 자서 머리가 흐려진다

export function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (x, a = 0, b = 100) => Math.max(a, Math.min(b, x));

export const AGE_MIN = 20, AGE_MAX = 49;
export function newGame(story, seed = Date.now() % 1e9, opts = {}) {
  const age = Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(+opts.age || 32)));
  seed = Math.floor(Math.abs(+seed || 0)) >>> 0;
  const rnd = rng(seed);
  const fz = rng((seed ^ 0x9e3779b9) >>> 0); // 화면 표시 경계값(진상 난수열을 건드리지 않게 따로)
  const jit = (c, w) => c + (fz() * 2 - 1) * w;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

  // 바람 횟수 1~6 (20/25/25/15/10/5%)
  const r = rnd() * 100;
  const N = r < 20 ? 1 : r < 45 ? 2 : r < 70 ? 3 : r < 85 ? 4 : r < 95 ? 5 : 6;
  const whens = shuffle(story.whens);
  const others = shuffle(story.partners).slice(0, N - 1).sort((a, b) => a.depth - b.depth);
  const affairs = [{ ...story.trigger.partner, when: pick(story.trigger.whens) }, ...others.map((p, i) => ({ ...p, when: whens[i] }))]
    .map((a, i) => ({ id: i, partner: a.id, depth: a.depth, when: a.when, place: pick(story.places).id, wall: 28 + 21 * a.depth + rnd() * 12, confessed: false, denied: 0 }));

  // 증거: 계기가 된 메신저 알림은 처음부터 손에. 다른 바람은 6할 확률로 폰에 흔적. 관계없는 것(변명이 사실)도 1~2개
  const real = shuffle(story.evidence.real);
  const evidence = [{ id: 0, ...story.trigger.evidence, affairId: 0, found: true, used: false }];
  affairs.slice(1).forEach((a) => { if (rnd() < 0.6 && real.length) evidence.push({ id: evidence.length, ...real.pop(), affairId: a.id, found: false, used: false }); });
  shuffle(story.evidence.decoy).slice(0, 1 + Math.floor(rnd() * 2)).forEach((d) => evidence.push({ id: evidence.length, ...d, affairId: null, found: false, used: false }));
  // 폰 속: 앱마다 평범한 줄에 이번 판의 증거 줄을 섞는다
  const phoneRows = {};
  for (const [app, rows] of Object.entries(story.phone)) phoneRows[app] = shuffle(rows.map((x) => ({ ...x })));
  for (const e of evidence.slice(1)) { const rows = phoneRows[e.app] || (phoneRows[e.app] = []); rows.splice(Math.floor(rnd() * (rows.length + 1)), 0, { ev: e.id }); }

  const tell = pick(TELLS);
  return {
    story, seed, rnd, N, affairs, evidence, phoneRows, tell,
    min: START, day: 1, ended: null,
    age, ageK: 1 + (age - 25) * 0.012, // 나이: 어깨 부담이 쌓이는 속도와 시작 체력에 반영
    hp: 100 - Math.max(0, age - 30) * 0.5, pain: 0, fear: 15, stress: 25, confusion: 0, noise: 0, hunger: 20, strain: 10, drunk: 0, foolMin: 0,
    tension: 1, top: true, bottom: true, blind: false, recording: false, recStart: null, hairHold: 0, bonus: 0, bonusTurns: 0,
    baseline: 0, whyUsed: false, loveAsked: 0, minimizeUsed: 0, toolShows: 0, smashed: false, divorceUsed: false, motherUsed: false, phoneOpened: false,
    slaps: 0, hardSlaps: 0, strips: 0, shocks: 0, waters: 0, hairPulls: 0, drinks: 0, tightens: 0,
    rambles: 0, turn: 0, warned: 0,
    fuzz: { hp: [jit(75, 7), jit(52, 8), jit(30, 6), jit(14, 4)], noise: [jit(35, 8), jit(60, 8), jit(84, 5)], hunger: [jit(60, 8), jit(82, 6)], strain: [jit(45, 8), jit(75, 7)] },
    log: [],
  };
}

// ---------------------------------------------------------------- 시간
function advance(s, min, out) {
  for (let i = 0; i < min && !s.ended; i++) {
    s.min++;
    const rate = [0.03, 0.09, 0.22][s.tension] * s.ageK;
    s.strain = clamp(s.strain + rate - (s.tension === 0 ? 0.12 : 0));
    if (s.strain > 70) s.hp -= 0.04 + (s.strain - 70) * 0.004; // 어깨가 한계를 넘으면 체력이 깎인다
    if (s.hunger > 80) s.hp -= 0.02;
    s.hp -= ((s.top ? 0 : 1) + (s.bottom ? 0 : 1)) * 0.006; // 옷을 벗기면 몸이 식는다
    s.pain = clamp(Math.max(s.pain - 0.25, s.strain * 0.45));
    s.hunger = clamp(s.hunger + 0.08);
    s.noise = clamp(s.noise - 0.18);
    s.fear = clamp(s.fear - 0.03 + (s.blind ? 0.04 : 0));
    s.stress = clamp(s.stress - 0.02);
    if (s.min > LATE) s.confusion = clamp(s.confusion + 0.035);
    s.confusion = clamp(s.confusion + (s.pain > 60 ? 0.03 : 0) - 0.02);
    if (s.drunk > 0) s.drunk = Math.max(0, s.drunk - 1 / 90);
    if (s.foolMin > 0) s.foolMin--;
    if (s.hp <= 0) { s.hp = 0; s.ended = 'dead'; }
  }
  if (!s.ended && s.min >= MORNING) out.push({ t: 'morning' });
}
export const clock = (s) => { const m = s.min % (24 * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
export const isMorning = (s) => s.min >= MORNING;

// 화면에 숫자 대신 말로 내는 상태(경계값은 판마다 조금 다르다)
export function looks(s) {
  const f = s.fuzz;
  const hp = s.hp > f.hp[0] ? 'hp0' : s.hp > f.hp[1] ? 'hp1' : s.hp > f.hp[2] ? 'hp2' : s.hp > f.hp[3] ? 'hp3' : 'hp4';
  const noise = s.noise < f.noise[0] ? 'n0' : s.noise < f.noise[1] ? 'n1' : s.noise < f.noise[2] ? 'n2' : 'n3';
  const arms = s.strain < f.strain[0] ? null : s.strain < f.strain[1] ? 'arm1' : 'arm2';
  const hunger = s.hunger < f.hunger[0] ? null : s.hunger < f.hunger[1] ? 'hu1' : 'hu2';
  return { hp, noise, arms, hunger, hpLevel: ['hp0', 'hp1', 'hp2', 'hp3', 'hp4'].indexOf(hp), noiseLevel: ['n0', 'n1', 'n2', 'n3'].indexOf(noise) };
}

// ---------------------------------------------------------------- 말
const say = (out, who, key, vars = {}, extra = {}) => out.push({ t: 'say', who, key, vars, ...extra });
const affairVars = (s, a) => ({ partner: a.partner, when: a.when, place: a.place });
const nextAffair = (s) => s.affairs.find((a) => !a.confessed) || null;

// 압박: 아픔·두려움·긴장 + 그때의 덤 + 같은 건을 부인시킨 횟수 + 술 − 녹음 + 흔들림
export const pressure = (s, a) => s.pain * 0.3 + s.fear * 0.35 + s.stress * 0.25 + s.bonus + 5 * Math.min(a ? a.denied : 0, 6) + 7 * Math.min(3, s.drunk) - (s.recording ? 8 : 0) + (s.rnd() * 14 - 7);
// 머리가 안 돌아가면(혼란·심한 통증·술) 엉뚱한 소리를 한다. 거짓 자백은 하지 않는다
const rambleProb = (s) => clamp((s.confusion - 40) / 90 + (s.pain - 60) / 160 + 0.1 * Math.min(3, s.drunk), 0, 0.7);
const truthTellP = (s) => 0.06 + s.stress / 260 + 0.08 * Math.min(3, s.drunk);

function showTells(s, lying, strong = 0.7) {
  if (s.blind) return []; // 눈을 가리면 얼굴을 못 읽는다(양날)
  const boost = s.hairHold > 0 ? 0.15 : 0;
  const res = [];
  if (lying ? s.rnd() < strong + boost : s.rnd() < truthTellP(s)) res.push(s.tell);
  if (s.rnd() < 0.1) { const o = TELLS.filter((t) => t !== s.tell); res.push(o[Math.floor(s.rnd() * o.length)]); } // 헷갈리게
  return res;
}

function confess(s, a, out) {
  a.confessed = true;
  s.stress = clamp(s.stress - 18); s.fear = clamp(s.fear - 6); s.bonus = 0; s.bonusTurns = 0;
  s.log.push({ affair: a.id, min: s.min, recorded: s.recording, force: forceOf(s) });
  const first = s.affairs.filter((x) => x.confessed).length === 1;
  say(out, 'h', first ? 'confess_first' : 'confess_more', affairVars(s, a), { face: 'ashamed' });
  say(out, 'h', 'confess_body', affairVars(s, a), { face: 'crying' });
  out.push({ t: 'confess', affair: a.id });
}
function ramble(s, out) {
  s.rambles++;
  say(out, 'h', s.foolMin > 0 ? 'drunk_nonsense' : 'ramble', {}, { face: s.foolMin > 0 ? 'drunk' : 'exhausted' });
}
function deny(s, lying, out, angry = true) {
  const t = showTells(s, lying);
  const key = !lying && !nextAffair(s) ? 'deny_none' : angry && s.fear < 35 && s.rnd() < 0.4 ? 'deny_angry' : 'deny';
  say(out, 'h', key, {}, { face: key === 'deny_angry' ? 'angry' : s.fear > 55 ? 'afraid' : 'nervous', tells: t });
}
function answer(s, extra, out) {
  if (s.foolMin > 0 || s.rnd() < rambleProb(s)) return ramble(s, out);
  const a = nextAffair(s);
  if (!a) return deny(s, false, out, false);
  const p = pressure(s, a) + extra;
  if (p >= a.wall) return confess(s, a, out);
  a.denied++;
  deny(s, true, out);
}

// ---------------------------------------------------------------- 행동 목록
// group: 'ask'(묻기) 'press'(몰아붙이기) 'other'(기타). min: 걸리는 시간(분). force: 점수에서 '폭력'으로 세는 무게
export const ACTIONS = {
  push: { group: 'ask', min: 5 },
  baseline: { group: 'ask', min: 2 },
  minimize: { group: 'ask', min: 3 },
  evidence: { group: 'ask', min: 5, arg: 'evidence' },
  recheck: { group: 'ask', min: 10 },
  askLove: { group: 'ask', min: 3 },
  askWhy: { group: 'ask', min: 4 },
  silence: { group: 'ask', min: 10 },
  slap: { group: 'press', min: 1 },
  slapHard: { group: 'press', min: 1 },
  water: { group: 'press', min: 2 },
  tighten: { group: 'press', min: 2 },
  hair: { group: 'press', min: 1 },
  blind: { group: 'press', min: 2 },
  tools: { group: 'press', min: 3 },
  shock: { group: 'press', min: 3 },
  smash: { group: 'press', min: 3 },
  stripTop: { group: 'press', min: 4 },
  stripBottom: { group: 'press', min: 4 },
  divorce: { group: 'press', min: 3 },
  mother: { group: 'press', min: 3 },
  phone: { group: 'other', min: 10 },
  cry: { group: 'other', min: 3 },
  loosen: { group: 'other', min: 2 },
  rest: { group: 'other', min: 30 },
  feed: { group: 'other', min: 15 },
  sake: { group: 'other', min: 5 },
  record: { group: 'other', min: 1 },
  leave: { group: 'other', min: 360 },
};
const HIDDEN = { look: { min: 2 }, take: { min: 1 } }; // 폰 화면 안의 손(버튼에는 안 나옴, 기록에는 남음)

export function available(s) {
  if (s.ended || isMorning(s)) return [];
  return Object.keys(ACTIONS).filter((id) => {
    if (id === 'askWhy') return !s.whyUsed && s.affairs.some((a) => a.confessed);
    if (id === 'evidence') return s.evidence.some((e) => e.found && !e.used);
    if (id === 'smash') return !s.smashed;
    if (id === 'stripTop') return s.top;
    if (id === 'stripBottom') return s.bottom;
    if (id === 'divorce') return !s.divorceUsed;
    if (id === 'mother') return !s.motherUsed;
    if (id === 'tighten') return s.tension < 2;
    if (id === 'loosen') return s.tension > 0;
    return true;
  });
}
// 버튼 이름의 열쇠(story.json 의 ui.act.*). 상태에 따라 바뀌는 것
export function labelKey(s, id) {
  if (id === 'baseline') return null; // 질문 문장 그대로
  if (id === 'blind') return s.blind ? 'blindOff' : 'blindOn';
  if (id === 'record') return s.recording ? 'recordOff' : 'recordOn';
  return id;
}
export const baselineQ = (s) => s.story.baseline[s.baseline % s.story.baseline.length];

export function act(s, id, arg) {
  const out = [];
  if (s.ended) return out;
  const A = ACTIONS[id] || HIDDEN[id];
  if (!A) return out;
  s.turn++;
  if (s.bonusTurns > 0 && --s.bonusTurns === 0) s.bonus = 0;
  if (s.hairHold > 0) s.hairHold--;
  const violent = (k) => { // 줄을 늦춘 상태에서 때리면 도망칠 수 있다
    if (s.tension === 0 && s.rnd() < 0.01 + k * 0.02 + s.fear / 1500) { s.ended = 'escaped'; out.push({ t: 'anim', name: 'escape' }); }
  };
  const noise = (n) => {
    const before = looks(s).noiseLevel;
    s.noise = clamp(s.noise + n);
    const after = looks(s).noiseLevel;
    if (after > before) out.push({ t: 'neighbor', level: after });
    if (s.noise >= 100) s.ended = 'police';
  };

  switch (id) {
    case 'push':
      say(out, 'w', 'w_push');
      answer(s, 0, out);
      break;
    case 'baseline': {
      const q = baselineQ(s);
      say(out, 'w', 'baseline_q', { q: q.id });
      const t = showTells(s, false);
      say(out, 'h', 'baseline_a', { q: q.id, a: q.id }, { face: s.fear > 55 ? 'afraid' : 'nervous', tells: t });
      s.baseline++;
      break;
    }
    case 'minimize': {
      say(out, 'w', 'w_minimize');
      const k = Math.max(0, 14 - 5 * s.minimizeUsed - 0.3 * forceOf(s));
      s.minimizeUsed++;
      s.fear = clamp(s.fear - 4);
      answer(s, k, out);
      break;
    }
    case 'evidence': {
      const e = s.evidence.find((x) => x.id === +arg && x.found && !x.used);
      if (!e) return out;
      e.used = true;
      say(out, 'w', 'w_evidence', { ev: e.id });
      out.push({ t: 'show', what: 'phone', ev: e.id });
      if (e.affairId === null) { // 관계없는 것: 변명이 사실
        say(out, 'h', 'excuse_true', { ev: e.id }, { face: 'nervous', tells: showTells(s, false) });
        s.stress = clamp(s.stress - 6);
        break;
      }
      const a = s.affairs[e.affairId];
      if (a.confessed) { say(out, 'h', 'already', {}, { face: 'ashamed' }); break; }
      const STR = { 3: 40, 2: 26, 1: 14 };
      // 증거가 가리키는 건은 순서를 건너뛰어 그 건을 친다
      const p = pressure(s, a) + STR[e.strength] + (e.affairId === 0 ? 10 : 0);
      if (s.foolMin > 0) { ramble(s, out); break; }
      if (p >= a.wall) confess(s, a, out);
      else {
        a.denied += 2;
        say(out, 'h', 'evidence_deny', { ev: e.id }, { face: 'afraid', tells: showTells(s, true, 0.85) });
      }
      break;
    }
    case 'recheck':
      say(out, 'w', 'w_recheck');
      s.confusion = clamp(s.confusion - 15); s.stress = clamp(s.stress - 4);
      answer(s, 4, out);
      break;
    case 'askLove': {
      s.loveAsked++;
      say(out, 'w', 'w_love');
      // 마음이 넘어간 상대(깊이 3)를 숨기고 있으면 '사랑해'가 거짓말이다
      const lying = s.affairs.some((a) => !a.confessed && a.depth >= 3);
      say(out, 'h', s.loveAsked > 2 ? 'love_tired' : 'love', {}, { face: 'crying', tells: showTells(s, lying, 0.55) });
      s.fear = clamp(s.fear - 3);
      break;
    }
    case 'askWhy': {
      s.whyUsed = true;
      const last = [...s.affairs].reverse().find((a) => a.confessed);
      say(out, 'w', 'w_why', { partner: last.partner });
      if (s.rnd() < 0.35 && nextAffair(s)) { // 말이 미끄러진다: 다음 건의 실마리
        say(out, 'h', 'why_slip', affairVars(s, nextAffair(s)), { face: 'afraid' });
        s.bonus = 30; s.bonusTurns = 2;
      } else say(out, 'h', 'why_dodge', {}, { face: 'ashamed' });
      break;
    }
    case 'silence':
      say(out, 'n', 'silence');
      s.stress = clamp(s.stress + 8);
      if (s.stress > 60 && s.rnd() < 0.25) answer(s, 4, out);
      else say(out, 'h', 'silence_h', {}, { face: 'nervous' });
      break;
    case 'slap':
      s.slaps++; s.pain = clamp(s.pain + 8); s.fear = clamp(s.fear + 6); s.hp -= 2; s.stress = clamp(s.stress + 3);
      out.push({ t: 'anim', name: 'slap' }); noise(6);
      say(out, 'h', 'hurt_small', {}, { face: 'hurt_reflex' });
      violent(1);
      break;
    case 'slapHard':
      s.hardSlaps++; s.pain = clamp(s.pain + 16); s.fear = clamp(s.fear + 11); s.hp -= 5; s.confusion = clamp(s.confusion + 6);
      out.push({ t: 'anim', name: 'slapHard' }); noise(12);
      say(out, 'h', 'hurt_big', {}, { face: 'pained' });
      violent(2);
      break;
    case 'water':
      s.waters++; s.confusion = clamp(s.confusion - 22); s.fear = clamp(s.fear + 5); s.hp -= 1; s.drunk = Math.max(0, s.drunk - 0.7); s.foolMin = Math.max(0, s.foolMin - 40);
      out.push({ t: 'anim', name: 'water' }); noise(4);
      say(out, 'h', 'water', {}, { face: 'afraid' });
      break;
    case 'tighten':
      s.tension = Math.min(2, s.tension + 1); s.tightens++; s.fear = clamp(s.fear + 8); s.pain = clamp(s.pain + 6);
      out.push({ t: 'anim', name: 'tighten' }); out.push({ t: 'tension', v: s.tension });
      say(out, 'h', s.tension === 2 ? 'tight2' : 'tight1', {}, { face: 'pained' });
      break;
    case 'loosen':
      s.tension = Math.max(0, s.tension - 1); s.fear = clamp(s.fear - 4);
      out.push({ t: 'anim', name: 'loosen' }); out.push({ t: 'tension', v: s.tension });
      say(out, 'h', s.tension === 0 ? 'loose0' : 'loose1', {}, { face: 'relieved' });
      break;
    case 'hair':
      s.hairPulls++; s.pain = clamp(s.pain + 4); s.fear = clamp(s.fear + 4); s.hairHold = 2;
      out.push({ t: 'anim', name: 'hair' }); noise(2);
      say(out, 'w', 'w_hair');
      say(out, 'h', 'hair_h', {}, { face: 'afraid' });
      violent(0.5);
      break;
    case 'blind':
      s.blind = !s.blind; if (s.blind) s.fear = clamp(s.fear + 10);
      out.push({ t: 'anim', name: s.blind ? 'blindOn' : 'blindOff' });
      say(out, 'h', s.blind ? 'blind_on' : 'blind_off', {}, { face: 'afraid' });
      break;
    case 'tools':
      s.toolShows++; s.fear = clamp(s.fear + Math.max(4, 18 - 5 * (s.toolShows - 1))); noise(2);
      out.push({ t: 'anim', name: 'tools' });
      say(out, 'w', 'w_tools');
      say(out, 'h', 'tools_h', {}, { face: 'afraid' });
      break;
    case 'shock':
      s.shocks++; s.pain = clamp(s.pain + 22); s.fear = clamp(s.fear + 18); s.hp -= 7; s.confusion = clamp(s.confusion + 14);
      out.push({ t: 'anim', name: 'shock' }); noise(16);
      say(out, 'h', 'scream', {}, { face: 'pained' });
      violent(3);
      break;
    case 'smash':
      s.smashed = true; s.stress = clamp(s.stress + 22); s.fear = clamp(s.fear + 6);
      out.push({ t: 'anim', name: 'smash' }); noise(18);
      say(out, 'w', 'w_smash');
      say(out, 'h', 'smash_h', {}, { face: 'crying' });
      break;
    case 'stripTop': case 'stripBottom': { // 상의·하의 벗기기(속옷은 남긴다): 수치심과 추위
      const top = id === 'stripTop';
      s[top ? 'top' : 'bottom'] = false; s.strips++;
      s.stress = clamp(s.stress + 16); s.fear = clamp(s.fear + 6);
      out.push({ t: 'anim', name: id }); noise(2);
      say(out, 'w', top ? 'w_strip_top' : 'w_strip_bottom');
      say(out, 'h', top ? 'strip_top_h' : 'strip_bottom_h', {}, { face: 'ashamed' });
      break;
    }
    case 'divorce':
      s.divorceUsed = true; s.stress = clamp(s.stress + 25); s.fear = clamp(s.fear + 6);
      out.push({ t: 'anim', name: 'divorce' });
      say(out, 'w', 'w_divorce');
      say(out, 'h', 'divorce_h', {}, { face: 'crying' });
      break;
    case 'mother':
      s.motherUsed = true; s.stress = clamp(s.stress + 30); s.fear = clamp(s.fear + 5);
      out.push({ t: 'anim', name: 'call' });
      say(out, 'w', 'w_mother');
      say(out, 'h', 'mother_h', {}, { face: 'afraid' });
      s.bonus = 10; s.bonusTurns = 2;
      break;
    case 'phone':
      if (!s.phoneOpened) { s.phoneOpened = true; say(out, 'w', 'w_phone'); say(out, 'h', 'phone_h', {}, { face: 'nervous', tells: showTells(s, s.evidence.some((e) => e.affairId && !e.found)) }); }
      out.push({ t: 'phone' });
      break;
    case 'look': // 폰 안에서 한 줄 열어 봄 (arg: 앱 이름)
      break;
    case 'take': { // 폰 안의 증거를 손에 넣음
      const e = s.evidence.find((x) => x.id === +arg);
      if (e && !e.found) { e.found = true; out.push({ t: 'found', ev: e.id }); }
      break;
    }
    case 'cry':
      say(out, 'n', 'w_cry_n');
      s.fear = clamp(s.fear - 5);
      s.bonus = Math.max(s.bonus, 8); s.bonusTurns = 2;
      say(out, 'h', 'cry_h', {}, { face: 'crying' });
      break;
    case 'rest':
      s.tension = 0; s.hp = clamp(s.hp + 8); s.pain = clamp(s.pain - 20); s.confusion = clamp(s.confusion - 15); s.strain = clamp(s.strain - 35); s.fear = clamp(s.fear - 6); s.stress = clamp(s.stress - 5);
      out.push({ t: 'tension', v: 0 }); out.push({ t: 'anim', name: 'rest' });
      say(out, 'n', 'rest_n');
      break;
    case 'feed':
      s.hunger = clamp(s.hunger - 55); s.hp = clamp(s.hp + 5); s.fear = clamp(s.fear - 3);
      out.push({ t: 'anim', name: 'feed' });
      say(out, 'h', 'feed_h', {}, { face: 'relieved' });
      break;
    case 'sake':
      s.drinks++; s.drunk += 1; s.hp -= 1;
      out.push({ t: 'anim', name: 'drink' });
      if (s.drunk >= 3.5 && s.foolMin <= 0) { s.foolMin = 60; say(out, 'h', 'drunk_gone', {}, { face: 'drunk' }); }
      else say(out, 'h', 'drunk_h', {}, { face: s.drunk > 1.5 ? 'drunk' : 'nervous' });
      break;
    case 'record':
      s.recording = !s.recording;
      out.push({ t: 'anim', name: s.recording ? 'recordOn' : 'recordOff' });
      say(out, 'w', s.recording ? 'w_rec_on' : 'w_rec_off');
      if (s.recording) say(out, 'h', 'rec_h', {}, { face: 'nervous' });
      break;
    case 'leave':
      say(out, 'n', 'leave_n');
      s.stress = clamp(s.stress + 18); s.fear = clamp(s.fear + 8);
      break;
  }
  if (s.ended) { finish(s, out); return out; }
  advance(s, A.min, out);
  // 죽을 것 같으면 알린다(두 번)
  if (!s.ended && s.warned === 0 && s.hp < 30) { s.warned = 1; out.push({ t: 'warn', level: 1 }); }
  if (!s.ended && s.warned === 1 && s.hp < 12) { s.warned = 2; out.push({ t: 'warn', level: 2 }); }
  if (s.ended) finish(s, out);
  return out;
}

// 아침: 회사에 '열이 나서 쉰다'고 전화하고 하루 더. 3일째 아침이면 걱정한 동료가 경찰을 데려온다
export function keepGoing(s) {
  const out = [];
  if (s.day >= MAX_DAYS) { s.ended = 'police_colleague'; finish(s, out); return out; }
  s.day++;
  s.min = START; // 하루를 건너 다시 밤으로(낮 동안은 방치)
  s.hp -= 14; s.hunger = clamp(s.hunger + 35); s.strain = clamp(s.strain + 20); s.stress = clamp(s.stress + 10); s.noise = 0; s.confusion = clamp(s.confusion + 8);
  if (s.hp <= 0) { s.hp = 0; s.ended = 'dead'; finish(s, out); return out; }
  out.push({ t: 'newday', day: s.day });
  return out;
}

function finish(s, out) { out.push({ t: 'end', kind: s.ended }); }

// ---------------------------------------------------------------- 판결과 답 맞추기
export const STR_WON = { 3: 500, 2: 300, 1: 100 }; // 증거 강도 → 위자료 덤(만 원)
export const forceOf = (s) => s.slaps * 1.5 + s.hardSlaps * 3 + s.shocks * 5 + s.hairPulls + s.waters * 0.5 + s.tightens * 1.5 + s.toolShows * 0.5 + (s.smashed ? 2 : 0) + s.strips * 1.5;

export function verdict(s, kind) {
  const N = s.N;
  const told = s.affairs.filter((a) => a.confessed).length;
  const hidden = s.affairs.filter((a) => !a.confessed);
  const force = forceOf(s);
  const arrested = ['dead', 'police', 'police_colleague'].includes(s.ended);
  // 강요된 자백은 증거 능력이 약하다(폭력이 클수록)
  const coercion = clamp(force / 25, 0, 1);
  let amount = 0;
  if (kind === 'divorce') {
    amount = 1000;
    for (const a of s.affairs.filter((x) => x.confessed)) {
      const ev = s.evidence.filter((e) => e.found && e.affairId === a.id).map((e) => STR_WON[e.strength]);
      const rec = s.log.find((l) => l.affair === a.id && l.recorded) ? 200 : 0;
      amount += (300 + Math.max(0, ...ev, 0) + rec) * (1 - 0.6 * coercion);
    }
    amount = Math.round(amount / 10) * 10;
  }
  const good = !arrested && s.ended !== 'escaped' && (kind === 'divorce' ? told > 0 : told === N);
  const score = arrested ? 0 : Math.round(60 * told / N + (force === 0 ? 30 : force < 6 ? 22 : force < 12 ? 12 : 0) + (good ? 10 : 0));
  const rank = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
  // 결말 뒤의 장면
  let epilogue = null;
  if (!arrested && s.ended !== 'escaped') {
    if (kind === 'divorce') epilogue = 'apart';
    else epilogue = hidden.length ? 'phone' : force > 12 ? 'cold' : 'warm';
  }
  return {
    kind, ended: s.ended, told, N, amount, score, rank, force: Math.round(force), coercion, arrested, epilogue, good,
    perfect: force === 0 && !hidden.length,
    affairs: s.affairs.map((a) => ({ partner: a.partner, when: a.when, place: a.place, confessed: a.confessed })),
    tell: s.tell, rambles: s.rambles, day: s.day, age: s.age,
  };
}

// 폰 앱의 줄: [{ t, d }(평범한 줄) | { ev }(증거)]
export const appRows = (s, app) => (s.phoneRows[app] || []).map((r) => (r.ev !== undefined ? { ev: s.evidence[r.ev] } : r));
