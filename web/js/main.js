// 본체: 방·묶인 사람·팔·게임 규칙을 잇고, 행동마다 연출(대사·표정·팔 동작·소리)을 붙인다.
// URL: ?seed=123 같은 진상, ?lang=ko|en, ?mode=h|w, ?fast(10배속), ?step(자동으로 안 움직임: window.__step(n)), ?shot(캡처용).
// window.__act(행동, 인자) 로 밖에서 움직일 수 있다(확인·촬영용). window.__ready 는 다 읽었을 때 true.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { vq } from './version.js';
import * as I18N from './i18n.js';
import { t, line, lines, loc, store } from './i18n.js';
import { loadHusband } from './husband.js';
import { loadArms } from './arms.js';
import { makeRoom } from './room.js';
import { makeClips } from './clips.js';
import * as P from './props.js';
import * as AU from './audio.js';
import { newGame, act, available, verdict, keepGoing, ACTIONS, labelKey, baselineQ, looks, clock, isMorning, appRows, rng } from './game.js';

const q = new URLSearchParams(location.search);
const FAST = q.has('fast') ? 0.1 : 1;
const $ = (id) => document.getElementById(id);
const MODE = I18N.pickMode();
const story = await I18N.load(undefined, MODE);
const faces = await fetch(vq('./data/faces.json')).then((r) => r.json());
const SAVE_KEY = 'wm_save';

// ---------------------------------------------------------------- 3D
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: q.has('shot') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070605);
const envTex = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
scene.environmentIntensity = 0.18;
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.03, 40);
const fitFov = (aspect) => (aspect >= 1 ? 48 : Math.min(48 * 1.45, (2 * Math.atan(Math.tan((48 * Math.PI) / 360) / aspect) * 180) / Math.PI));
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.fov = fitFov(camera.aspect); camera.updateProjectionMatrix(); layoutSub(); });
camera.fov = fitFov(innerWidth / innerHeight); camera.updateProjectionMatrix();

THREE.DefaultLoadingManager.onProgress = (url, n, total) => { $('go').textContent = `${t('loading')} ${Math.round((n / Math.max(1, total)) * 100)}%`; };
const room = makeRoom(scene);
const [H, A] = await Promise.all([
  loadHusband(scene, { url: MODE === 'w' ? './assets/spouse_f.glb' : './assets/husband.glb', envTex, faces }),
  loadArms(scene, camera, { url: MODE === 'w' ? './assets/hands_m.glb' : './assets/wife.glb', envTex, ring: true }),
]);
H.setExpr('nervous');
const fxTicks = [];
let shakeAmp = 0;
const fx = {
  flash: (k) => { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = k; requestAnimationFrame(() => { f.style.transition = 'opacity .35s'; f.style.opacity = 0; }); },
  shake: (k) => { shakeAmp = Math.max(shakeAmp, k); },
  tick: (fn) => fxTicks.push(fn),
  lamp: (k) => { room.lights.key.intensity = 26 * k; },
};
// 소품 상태
let blindObj = null, toolboxObj = null, recorderObj = null;
const X = {
  H, A, scene, fx,
  setBlind(on) {
    if (on && !blindObj) { blindObj = P.blindfold(); H.attachToHead(blindObj, H.eyeMidRest.clone().add(new THREE.Vector3(0, 0.005, -0.075))); }
    if (blindObj) blindObj.visible = on;
  },
  placeToolbox() { if (!toolboxObj) { toolboxObj = P.toolbox(); toolboxObj.position.set(0.32, 0, 0.42); toolboxObj.rotation.y = -0.5; scene.add(toolboxObj); } },
  placeRecorder(on) {
    if (on && !recorderObj) { recorderObj = P.recorder(); recorderObj.position.set(-0.38, 0.006, 0.5); recorderObj.rotation.set(-Math.PI / 2, 0, 0.3); scene.add(recorderObj); }
    if (recorderObj) recorderObj.visible = on;
  },
};
const C = makeClips(X);

// 카메라 자리(묻는 사람의 눈)
const VIEWS = {
  base: () => ({ pos: new THREE.Vector3(0.02, 1.58, 1.75), look: H.point('eyes').add(new THREE.Vector3(0, -0.22, 0)) }),
  near: () => ({ pos: new THREE.Vector3(0.03, 1.58, 0.6), look: H.point('eyes').add(new THREE.Vector3(0, -0.06, 0)) }),
  chest: () => ({ pos: new THREE.Vector3(0.05, 1.5, 0.62), look: H.point('spine_03').add(new THREE.Vector3(0, 0.05, 0)) }),
  rope: () => ({ pos: new THREE.Vector3(0.02, 1.62, 0.42), look: H.wristMid().add(new THREE.Vector3(0, 0.12, 0)) }),
  low: () => ({ pos: new THREE.Vector3(0.1, 1.2, 0.95), look: new THREE.Vector3(0.25, 0.25, 0.3) }),
  wide: () => ({ pos: new THREE.Vector3(0.5, 1.62, 2.3), look: new THREE.Vector3(0, 1.35, 0) }),
  epi: () => ({ pos: new THREE.Vector3(-1.3, 1.3, 2.45), look: new THREE.Vector3(-1.45, 0.74, 1.2) }),
  epiWin: () => ({ pos: new THREE.Vector3(-0.3, 1.5, 1.6), look: new THREE.Vector3(-1.05, 1.4, -1.9) }),
};
let view = 'base', camPos = VIEWS.base().pos.clone(), camLook = VIEWS.base().look.clone(), camRate = 3;
const setView = (v, rate = 3) => { view = v; camRate = rate; };
// 처음 자리
H.update(1 / 60);
{ const v = VIEWS.base(); camPos.copy(v.pos); camLook.copy(v.look); camera.position.copy(camPos); camera.lookAt(camLook); }

// ---------------------------------------------------------------- 게임 상태
let seed = +(q.get('seed') || Math.floor(Math.random() * 1e9));
let G = newGame(story, seed);
let ACTS = [];
const lineRnd = rng(seed ^ 0x1234); // 대사 고르기용(진상과 별개)
let ended = false;

// ---------------------------------------------------------------- 자막
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000 * FAST));
let skipWait = null;
addEventListener('pointerdown', (e) => { if (e.target.closest('button,input,#phoneui,.card')) return; if (skipWait) skipWait(); });
const waitOrTap = (s) => new Promise((r) => { const to = setTimeout(done, s * 1000 * FAST); function done() { clearTimeout(to); skipWait = null; r(); } skipWait = done; });
function layoutSub() { const h = $('acts').getBoundingClientRect().height; document.documentElement.style.setProperty('--subBottom', `${Math.max(60, h + 10)}px`); }
async function show(who, text, { face, tells, hold } = {}) {
  const sub = $('sub');
  if (!text) return;
  sub.className = who;
  const label = who === 'n' ? '' : who === 'h' ? I18N.spouse(true) : loc(story.who[who]);
  sub.innerHTML = (label ? `<b>${label}</b>` : '') + text.replace(/</g, '&lt;');
  const dur = Math.min(6, 0.9 + [...text].length * (I18N.lang === 'ko' ? 0.075 : 0.045));
  if (who === 'h') {
    if (face) H.setExpr(face);
    H.say(text, I18N.lang, Math.max(0.5, dur - 0.7) * FAST);
    if (tells && tells.length) tells.forEach((tl, i) => setTimeout(() => H.tell(tl), (350 + i * 900) * FAST));
  }
  await waitOrTap(hold ?? dur);
  if (who === 'h') H.stopTalk();
}
const clearSub = () => { $('sub').innerHTML = ''; };

// ---------------------------------------------------------------- 화면(UI)
function staticTexts() {
  document.querySelectorAll('[data-t]').forEach((el) => { el.innerHTML = t(el.dataset.t); });
  $('title').innerHTML = t('title'); $('lead').innerHTML = t('lead');
  $('hname').placeholder = t('name_ph');
  document.querySelectorAll('#langRow button').forEach((b) => b.classList.toggle('on', b.dataset.lang === I18N.lang));
  document.querySelectorAll('#modeRow button').forEach((b) => { b.textContent = t('mode_' + b.dataset.mode); b.classList.toggle('on', b.dataset.mode === MODE); });
  $('skip').textContent = t('skip');
  $('logHead').innerHTML = `${t('notes_conf')}<i id="logN"></i>`; $('eviHead').textContent = t('notes_ev');
}
staticTexts();
document.querySelectorAll('#langRow button').forEach((b) => (b.onclick = () => { store.set('wm_lang', b.dataset.lang); const u = new URL(location.href); u.searchParams.set('lang', b.dataset.lang); location.href = u.toString(); }));
document.querySelectorAll('#modeRow button').forEach((b) => (b.onclick = () => { if (b.dataset.mode === MODE) return; store.set('wm_mode', b.dataset.mode); const u = new URL(location.href); u.searchParams.set('mode', b.dataset.mode); location.href = u.toString(); }));
$('hname').value = store.get('wm_name') || '';
{ const v = JSON.parse(store.get('wm_vol') || '{}'); for (const k of ['se', 'amb', 'bgm']) { const val = v[k] ?? AU.volumes()[k]; $(`vol_${k}`).value = Math.round(val * 100); AU.setVolume(k, val); $(`vol_${k}`).oninput = (e) => { AU.setVolume(k, e.target.value / 100); store.set('wm_vol', JSON.stringify(AU.volumes())); }; } }

function hud() {
  const L = looks(G);
  $('day').textContent = t('day', { n: G.day });
  $('clock').textContent = clock(G);
  room.setClock(G.min);
  $('condLab').textContent = t('look_h'); $('armLab').textContent = t('arms'); $('hoodLab').textContent = t('hood');
  const c = $('cond'); c.textContent = t(L.hp); c.className = 'state' + (L.hpLevel >= 3 ? ' bad' : L.hpLevel >= 2 ? ' worse' : '');
  const a = $('arm'); a.textContent = t(L.arms ? (L.arms === 'arm1' ? 'arm1' : 'arm2') : 'arm0'); a.className = 'state' + (L.arms === 'arm2' ? ' bad' : L.arms ? ' worse' : '');
  const h = $('hood'); h.textContent = t(L.noise); h.className = 'state' + (L.noiseLevel >= 3 ? ' bad' : L.noiseLevel >= 2 ? ' worse' : '');
  const tags = [];
  tags.push(`<span>${t('tension' + G.tension)}</span>`);
  if (L.hunger) tags.push(`<span>${t(L.hunger)}</span>`);
  if (G.blind) tags.push(`<span>${t('blindTag')}</span>`);
  if (G.recording) tags.push(`<span class="rec">● ${t('recTag')}</span>`);
  if (G.drunk >= 1.5 || G.foolMin > 0) tags.push(`<span>${t('drunkTag')}</span>`);
  $('tags').innerHTML = tags.join('');
  // 몸에 반영
  H.state.sag = Math.min(1, Math.max(0, (70 - G.hp) / 70) + (G.strain > 80 ? 0.2 : 0));
  H.state.tremble = Math.max(0, (G.strain - 40) / 60);
  H.setPale(Math.max(0, (75 - G.hp) / 90));
  H.face.mouthShut = false;
  idleFace();
}
function idleFace() {
  if (G.ended === 'dead') { H.state.dead = true; return; }
  H.setExpr(G.foolMin > 0 || G.drunk > 2 ? 'drunk' : G.hp < 30 ? 'exhausted' : G.pain > 55 ? 'pained' : G.fear > 60 ? 'afraid' : G.fear > 30 || G.stress > 50 ? 'nervous' : 'calm');
}
const affairText = (a) => `${I18N.word(a.partner)}<small>${I18N.word(a.when)} · ${I18N.word(a.place)}</small>`;
function notes() {
  const got = G.affairs.filter((a) => a.confessed);
  $('logN').textContent = got.length ? `${got.length}` : '';
  $('log').innerHTML = got.length ? got.map((a) => `<li>${affairText(a)}</li>`).join('') : `<li class="struck">${t('notes_none')}</li>`;
  $('evi').innerHTML = G.evidence.filter((e) => e.found).map((e) => `<li class="${e.used ? 'used' : ''}">${loc(e.name)}<em class="str s${e.strength}">${t('str' + e.strength)}</em>${e.used ? ` <small>${t('used')}</small>` : ''}<small>${loc(e.desc)}</small></li>`).join('');
}
$('notes').onclick = () => $('notes').classList.toggle('open');

let tab = 'ask';
function minLabel(m) { return m >= 60 ? t('hours', { n: m / 60 }) : t('min', { n: m }); }
function actions() {
  const av = new Set(available(G));
  const groups = { ask: [], press: [], other: [] };
  for (const [id, a] of Object.entries(ACTIONS)) {
    if (!av.has(id)) continue;
    const k = labelKey(G, id);
    const label = k ? (MODE === 'w' && I18N.ui.act_w?.[k] ? loc(I18N.ui.act_w[k]) : t('act.' + k)) : (I18N.lang === 'ko' ? `「${loc(baselineQ(G).q)}」` : `“${loc(baselineQ(G).q)}”`);
    groups[a.group].push(`<button class="${a.group}" data-act="${id}">${label}<small>${minLabel(a.min)}</small></button>`);
  }
  const verdictBtn = `<button class="verdict" data-act="__verdict">${t('verdictBtn')}</button>`;
  $('acts').innerHTML = `<div class="tabs">${['ask', 'press', 'other'].map((g) => `<button data-tab="${g}" class="${tab === g ? 'on' : ''}">${t('g_' + g)}</button>`).join('')}${verdictBtn}</div>`
    + ['ask', 'press', 'other'].map((g) => `<div class="row ${tab === g ? 'on' : ''}"><span>${t('g_' + g)}</span>${groups[g].join('')}${g === 'ask' ? verdictBtn : ''}</div>`).join('');
  $('acts').querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; actions(); }));
  $('acts').querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => onAct(b.dataset.act)));
  layoutSub();
}
function refresh() { hud(); notes(); actions(); }

// ---------------------------------------------------------------- 고르기 카드
function pick(title, text, opts) {
  return new Promise((res) => {
    $('pickTitle').innerHTML = title; $('pickText').innerHTML = text || ''; $('pickText').style.display = text ? '' : 'none';
    $('pickOpts').innerHTML = opts.map((o, i) => `<button data-i="${i}">${o.label}${o.sub ? `<small>${o.sub}</small>` : ''}</button>`).join('');
    $('pick').classList.add('on');
    $('pickOpts').querySelectorAll('button').forEach((b) => (b.onclick = () => { $('pick').classList.remove('on'); res(opts[+b.dataset.i].value); }));
  });
}

// ---------------------------------------------------------------- 행동
let busy = false;
const setBusy = (b) => { busy = b; document.body.classList.toggle('busy', b); };
async function onAct(id) {
  if (busy || ended) return;
  if (id === '__verdict') return verdictFlow();
  let arg;
  if (id === 'evidence') {
    const evs = G.evidence.filter((e) => e.found && !e.used);
    arg = await pick(t('pickEv'), '', [...evs.map((e) => ({ label: `${loc(e.name)} <em class="str s${e.strength}">${t('str' + e.strength)}</em>`, sub: loc(e.desc), value: e.id })), { label: t('cancel'), value: null }]);
    if (arg === null) return;
  }
  await perform(id, arg);
}
async function perform(id, arg, quiet = false) {
  setBusy(true);
  ACTS.push(arg === undefined ? [id] : [id, arg]);
  const evs = act(G, id, arg);
  saveGame();
  await playEvents(id, evs);
  if (!ended) { refresh(); setBusy(false); }
}
// 행동별 팔 동작
function clipFor(id) {
  switch (id) {
    case 'slap': return C.slap(false);
    case 'slapHard': return C.slap(true);
    case 'water': return C.water();
    case 'tighten': return C.tighten(G.tension);
    case 'loosen': case 'rest': return C.loosen(G.tension);
    case 'hair': return C.hair();
    case 'blindOn': return C.blindOn();
    case 'blindOff': return C.blindOff();
    case 'tools': return C.tools();
    case 'shock': return C.shock();
    case 'smash': return C.smash(MODE === 'w' ? 'ring' : 'watch');
    case 'divorce': return C.divorce();
    case 'call': return C.call();
    case 'feed': return C.feed();
    case 'drink': return C.drink();
    case 'recordOn': return C.recordOn();
    case 'recordOff': return C.recordOff();
    case 'show': return C.showPhone();
    default: return null;
  }
}
async function runClip(clip) {
  if (!clip) return;
  setView(clip.view || 'base', 5);
  // 카메라가 자리에 올 때까지(최대 1.5초) 기다린 뒤 손을 움직인다
  for (let i = 0; i < 30 && camPos.distanceTo(VIEWS[view]().pos) > 0.03; i++) await new Promise((r) => setTimeout(r, 50));
  await A.play(clip);
  if (!clip.hold) setView('base', 2);
}
const lineVars = (ev) => ({ ...ev.vars, _ev: (id) => G.evidence[id], ...(ev.vars.ev !== undefined && G.evidence[ev.vars.ev]?.excuse ? { excuse: G.evidence[ev.vars.ev].excuse } : {}), day: G.day });
async function playEvents(id, evs) {
  // 묻기 행동은 가벼운 손짓
  if (ACTIONS[id]?.group === 'ask' && !['evidence', 'silence'].includes(id)) A.play(C.gesture());
  if (id === 'cry') runClip(C.cry());
  let clipDone = Promise.resolve();
  for (const ev of evs) {
    if (ended) break;
    switch (ev.t) {
      case 'say': {
        await clipDone;
        const vars = lineVars(ev);
        const text = line(ev.key, vars, lineRnd());
        await show(ev.who, text, { face: ev.face, tells: ev.tells });
        break;
      }
      case 'anim': {
        await clipDone;
        if (ev.name === 'escape') break;
        if (ev.name === 'rest') { room.updateRope && null; }
        const c = clipFor(ev.name);
        clipDone = runClip(c);
        // 맞는 동작은 끝까지 보고 나서 대사로
        if (['slap', 'slapHard', 'water', 'shock', 'smash', 'tighten', 'loosen', 'hair', 'tools', 'blindOn', 'blindOff', 'divorce', 'call', 'feed', 'drink', 'recordOn', 'rest'].includes(ev.name)) await clipDone;
        break;
      }
      case 'tension': break; // 클립의 사건에서 바꾼다
      case 'show': await runClip(C.showPhone()); break;
      case 'confess': notes(); AU.SFX.heartbeat(); break;
      case 'found': notes(); break;
      case 'neighbor': {
        [0, AU.SFX.thud, AU.SFX.wallbang, AU.SFX.knock][ev.level]?.();
        await show('n', line(`neighbor_${ev.level}`, {}, lineRnd()));
        if (ev.level >= 2) AU.bgm('danger');
        break;
      }
      case 'warn': AU.SFX.heartbeat(); await show('n', line(`warn_${ev.level}`, {}, lineRnd())); break;
      case 'phone': await phoneFlow(); break;
      case 'morning': await morningFlow(); break;
      case 'newday': break;
      case 'end': await endFlow(ev.kind); break;
    }
  }
  await clipDone;
  if (id === 'leave') await leaveFlow();
  clearSub();
}

// 내버려 두기: 어둡게 하고 시간이 흐른다
async function leaveFlow() {
  const f = $('fade'); f.textContent = ''; f.style.opacity = 1; room.lights.key.intensity = 0;
  await wait(1.6);
  room.lights.key.intensity = 26; f.style.opacity = 0;
  await wait(0.8);
}

// ---------------------------------------------------------------- 폰 뒤지기
async function phoneFlow() {
  A.play(C.phoneHold());
  const ui = $('phoneui'), body = $('phonebody');
  ui.className = 'on';
  const opened = new Set();
  await new Promise((done) => {
    const home = () => {
      body.innerHTML = `<div class="bar"><span>9:41</span><span>${clock(G)}</span></div><div class="home">${Object.entries(story.apps).map(([k, a]) => `<button data-app="${k}" class="${opened.has(k) ? 'opened' : ''}"><i>${a.icon}</i>${loc(a)}</button>`).join('')}</div><button class="ret">${t('phone_close')}</button>`;
      body.querySelectorAll('[data-app]').forEach((b) => (b.onclick = () => openApp(b.dataset.app)));
      body.querySelector('.ret').onclick = () => done();
    };
    const openApp = async (app) => {
      if (!opened.has(app)) { opened.add(app); ACTS.push(['look', app]); act(G, 'look', app); saveGame(); hud(); }
      const rows = appRows(G, app);
      body.innerHTML = `<div class="bar"><button class="back">${t('phone_back')}</button><span>${loc(story.apps[app])}</span><span></span></div><div class="rows">${rows.length ? rows.map((r, i) => r.ev ? `<button data-i="${i}" class="${r.ev.found ? 'took' : ''}">${loc(r.ev.name)}<small>${loc(r.ev.desc).slice(0, 26)}…</small></button>` : `<button data-i="${i}">${loc(r.t)}<small>${loc(r.d)}</small></button>`).join('') : `<div class="detail">${t('phone_nothing')}</div>`}</div>`;
      body.querySelector('.back').onclick = home;
      body.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => openRow(app, rows[+b.dataset.i])));
    };
    const openRow = (app, r) => {
      const isEv = !!r.ev;
      body.innerHTML = `<div class="bar"><button class="back">${t('phone_back')}</button><span>${loc(story.apps[app])}</span><span></span></div><div class="detail"><h4>${loc(isEv ? r.ev.name : r.t)}</h4>${app === 'messenger' ? `<div class="msg">${loc(isEv ? r.ev.desc : r.d)}</div>` : loc(isEv ? r.ev.desc : r.d)}</div>${isEv ? `<div class="act"><button class="take" ${r.ev.found ? 'disabled' : ''}>${r.ev.found ? t('phone_took') : t('phone_take')}</button></div>` : ''}`;
      body.querySelector('.back').onclick = () => openApp(app);
      const tk = body.querySelector('.take');
      if (tk && !r.ev.found) tk.onclick = () => { ACTS.push(['take', r.ev.id]); act(G, 'take', r.ev.id); saveGame(); notes(); AU.SFX.click(); openRow(app, { ev: G.evidence[r.ev.id] }); };
    };
    home();
  });
  ui.className = '';
  await A.play(C.phoneDown());
  refresh();
}

// ---------------------------------------------------------------- 아침·판결·결말
async function morningFlow() {
  AU.setAmbient('morning');
  await show('n', line('morning', {}, lineRnd()));
  const keep = G.day < 3;
  const v = await pick(t('morningTitle'), t('morningText'), [...(keep ? [{ label: t('keep'), value: 'keep' }] : []), { label: t('toVerdict'), value: 'verdict' }]);
  if (v === 'keep') {
    ACTS.push(['__keep']);
    const evs = keepGoing(G); saveGame();
    for (const e of evs) {
      if (e.t === 'newday') { const f = $('fade'); f.textContent = t('day', { n: G.day }); f.style.opacity = 1; await wait(1.8); f.style.opacity = 0; await show('n', line('newday', { day: G.day }, lineRnd())); AU.setAmbient('night'); }
      if (e.t === 'end') await endFlow(e.kind);
    }
  } else await verdictFlow(true);
}
async function verdictFlow(forced = false) {
  const opts = [
    { label: t('v_forgive'), sub: t('v_forgive_d'), value: 'forgive' },
    { label: MODE === 'w' ? t('v_pledge_w') : t('v_pledge'), sub: t('v_pledge_d'), value: 'pledge' },
    { label: t('v_divorce'), sub: t('v_divorce_d'), value: 'divorce' },
  ];
  if (!forced) opts.push({ label: t('back'), value: null });
  const kind = await pick(t('verdictTitle'), t('verdictText'), opts);
  if (!kind) return;
  ended = true; setBusy(true); clearSave();
  const r = verdict(G, kind);
  if (r.epilogue) await epilogue(r.epilogue);
  result(r);
}
async function endFlow(kind) {
  ended = true; setBusy(true); clearSave();
  if (kind === 'dead') { H.state.dead = true; AU.bgm(null); await wait(1.2); }
  if (kind === 'escaped') { H.root.visible = false; room.setRopeVisible(false); AU.SFX.thud(); }
  const ls = lines(`end_${kind}`);
  for (let i = 0; i < ls.length; i++) {
    if (kind === 'dead' && i === 1) AU.SFX.doorbell();
    if (kind === 'police' || kind === 'police_colleague') { if (i === 0) { AU.SFX.knock(); AU.SFX.siren(); } }
    await show(kind === 'police' ? 'p' : 'n', ls[i], { hold: 2.6 });
  }
  const f = $('fade'); f.textContent = ''; f.style.opacity = 1; await wait(1.4);
  result(verdict(G, null));
}
async function epilogue(kind) {
  document.body.classList.add('cine');
  const f = $('fade'); f.textContent = ''; f.style.opacity = 1;
  await wait(1.2);
  let skip = false; $('skip').onclick = () => { skip = true; if (skipWait) skipWait(); };
  // 장면 꾸미기: 아침 빛, 묶인 사람·줄·소품은 치운다
  room.setMorning(true); AU.setAmbient('morning'); AU.bgm(kind === 'apart' ? 'lonely' : 'morning');
  H.root.visible = false; room.setRopeVisible(false); A.root.visible = false;
  for (const o of [toolboxObj, recorderObj]) if (o) o.visible = false;
  const extras = [];
  if (kind !== 'apart') {
    const tb = room.table;
    const bowl = (x, z, c) => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, side: THREE.DoubleSide })); b.position.y = 0.06; const r = new THREE.Mesh(new THREE.CircleGeometry(0.055, 20), new THREE.MeshStandardMaterial({ color: 0xf4f1ea })); r.rotation.x = -Math.PI / 2; r.position.y = 0.055; g.add(b, r); g.position.set(x, 0.75, z); tb.add(g); extras.push(g); };
    bowl(-0.15, -0.2, 0x2b3f6b); bowl(0.15, 0.2, 0x8b2a22); bowl(0.0, -0.18, 0x1f1a17);
    if (kind === 'phone') { const p = P.phone(); p.rotation.x = -Math.PI / 2; p.position.set(0.35, 0.757, -0.1); tb.add(p); extras.push(p); p.userData.setGlow(true, 0xdde7ff); setTimeout(() => AU.SFX.buzz(), 3500 * FAST); }
    setView('epi', 50);
  } else {
    const box = (x, z, s) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5 * s, 0.4 * s, 0.4 * s), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.9 })); m.position.set(x, 0.2 * s, z); m.castShadow = true; scene.add(m); extras.push(m); };
    box(-0.4, -0.9, 1); box(-0.1, -1.1, 0.8); box(0.2, -0.85, 1.1);
    room.table.visible = false;
    setView('epiWin', 50);
  }
  await wait(0.2);
  f.style.opacity = 0;
  const ls = lines(`epi_${kind}`);
  for (const l of ls) { if (skip) break; const m = /^([hw]):(.*)$/s.exec(l); await show(m ? m[1] : 'n', m ? m[2] : l, { hold: 3.2 }); }
  f.style.opacity = 1; await wait(1.2);
  document.body.classList.remove('cine');
  clearSub();
}
function result(r) {
  const card = $('resultCard');
  const titleKey = r.arrested || r.ended === 'escaped' ? r.ended : r.kind;
  const title = loc(I18N.ui.resTitle[titleKey]);
  let story1;
  if (r.arrested) story1 = t('resText.arrested');
  else if (r.ended === 'escaped') story1 = t('resText.escaped');
  else story1 = r.told === r.N ? t('resText.all', { N: r.N }) : r.told ? t('resText.some', { N: r.N, told: r.told }) : t('resText.none', { N: r.N });
  const amount = r.kind === 'divorce' && !r.arrested ? `<p>${t('resText.amount', { amount: I18N.won(r.amount) })}${r.coercion > 0.3 ? `<br><small>${t('resText.coerced')}</small>` : ''}</p>` : '';
  const tellLabel = I18N.fill(loc(faces.tells[r.tell].label));
  const shareText = t('shareText', { rank: r.rank, N: r.N, told: r.told, title });
  card.innerHTML = `<div class="rank">${r.rank}</div><h2>${title}</h2><p class="story">${story1}</p>${amount}
    ${r.perfect ? `<p class="praise">${t('perfect')}</p>` : ''}
    <h3>${t('truth')}</h3><ul>${r.affairs.map((a) => `<li class="${a.confessed ? 'got' : 'hid'}">${I18N.word(a.partner)} <em>${a.confessed ? t('got') : t('hid')}</em><br><small>${I18N.word(a.when)} · ${I18N.word(a.place)}</small></li>`).join('')}</ul>
    <h3>${t('score')}</h3><dl><dt>${t('score')}</dt><dd>${r.score}</dd><dt>${t('tellWas')}</dt><dd>${tellLabel}</dd><dt>${t('force')}</dt><dd>${r.force === 0 ? t('force0') : r.force}</dd><dt>${t('rambles')}</dt><dd>${r.rambles}</dd></dl>
    <div class="opts"><div class="share"><button id="shareX">${t('share')}</button><button id="shareCopy">${t('copy')}</button></div><button id="again">${t('again')}</button></div>
    <p class="fiction">${t('fiction')}</p>`;
  $('result').classList.add('on');
  $('fade').style.opacity = 0;
  $('shareX').onclick = () => window.open(`https://x.com/intent/post?text=${encodeURIComponent(shareText + ' ' + location.origin + location.pathname)}`, '_blank', 'noopener');
  $('shareCopy').onclick = async () => { try { await navigator.clipboard.writeText(shareText + ' ' + location.origin + location.pathname); $('shareCopy').textContent = t('copied'); } catch { window.prompt(t('copy'), shareText); } };
  $('again').onclick = () => { const u = new URL(location.href); u.searchParams.delete('seed'); location.href = u.toString(); };
}

// ---------------------------------------------------------------- 저장·이어하기(seed + 행동 목록만)
function saveGame() { store.set(SAVE_KEY, JSON.stringify({ seed, mode: MODE, name: $('hname').value.trim(), acts: ACTS })); }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch { /* */ } }
function loadSave() { try { const s = JSON.parse(store.get(SAVE_KEY) || 'null'); return s && s.mode === MODE && Array.isArray(s.acts) && s.acts.length ? s : null; } catch { return null; } }
function replay(s) {
  seed = s.seed; G = newGame(story, seed); ACTS = [];
  for (const [id, arg] of s.acts) { ACTS.push(arg === undefined ? [id] : [id, arg]); if (id === '__keep') keepGoing(G); else act(G, id, arg); }
  // 화면 상태 맞추기
  H.state.tension = G.tension; X.setBlind(G.blind); if (G.toolShows) X.placeToolbox(); X.placeRecorder(G.recording);
  if (G.waters) H.wet(0.4);
}
const saved = loadSave();
if (saved) { $('resume').hidden = false; $('resume').textContent = t('resume'); }

// ---------------------------------------------------------------- 시작
async function begin(resume = false) {
  AU.unlock(); AU.ambient('night', () => G.min); AU.bgm('night');
  I18N.setName($('hname').value); store.set('wm_name', $('hname').value.trim());
  $('start').classList.remove('on');
  if (resume && saved) { replay(saved); refresh(); return; }
  setBusy(true);
  refresh();
  const intro = lines('intro', { ev0: '' });
  document.body.classList.add('cine');
  let skip = false; $('skip').onclick = () => { skip = true; if (skipWait) skipWait(); };
  for (let i = 0; i < intro.length; i++) {
    if (skip) break;
    if (i === 1) { // 알림
      const e = G.evidence[0];
      $('phoneui').className = 'on note'; $('phonebody').innerHTML = `<div class="bar"><span>${loc(story.apps.messenger)}</span><span>22:00</span></div><div class="msg">${loc(e.desc)}</div>`;
      AU.SFX.chime();
      await waitOrTap(2.6);
      $('phoneui').className = '';
      continue;
    }
    await show('n', intro[i], { hold: 2.4 });
  }
  document.body.classList.remove('cine');
  if (!skip) for (const l of lines('intro_h')) await show('h', l, { face: 'afraid' });
  clearSub();
  setBusy(false); refresh();
}
$('go').onclick = () => begin(false);
$('resume').onclick = () => begin(true);

// ---------------------------------------------------------------- 매 프레임
let last = performance.now();
function tick(dt) {
  H.update(dt);
  // 줄
  const wl = H.bones.hand_l.getWorldPosition(new THREE.Vector3()), wr = H.bones.hand_r.getWorldPosition(new THREE.Vector3());
  if (H.root.visible) room.updateRope(wl.clone().add(wr).multiplyScalar(0.5), wl, wr);
  // 카메라
  const v = VIEWS[view]();
  const k = 1 - Math.exp(-camRate * dt);
  camPos.lerp(v.pos, k); camLook.lerp(v.look, k);
  camera.position.copy(camPos);
  if (shakeAmp > 0) { camera.position.x += (Math.random() - 0.5) * shakeAmp; camera.position.y += (Math.random() - 0.5) * shakeAmp; shakeAmp = Math.max(0, shakeAmp - dt * 0.06); }
  // 숨쉬는 듯한 아주 작은 흔들림
  camera.position.y += Math.sin(performance.now() / 1300) * 0.003;
  camera.lookAt(camLook);
  if (H.root.visible) H.setLook(camera.position, G.fear > 70 ? 0.4 : 0.8);
  A.update(dt);
  for (let i = fxTicks.length - 1; i >= 0; i--) if (fxTicks[i](dt) === false) fxTicks.splice(i, 1);
  if (recorderObj && recorderObj.visible) recorderObj.userData.dot.visible = Math.floor(performance.now() / 600) % 2 === 0;
  renderer.render(scene, camera);
}
if (q.has('step')) window.__step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) tick(dt); };
else renderer.setAnimationLoop(() => { const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt); });

// 확인용
window.__act = (id, arg) => perform(id, arg);
window.__G = () => G;
window.__view = (v) => setView(v, 50);
window.__clip = (name, ...a) => runClip(C[name](...a));
window.__begin = begin;
window.__epi = (k) => epilogue(k);
window.__dbg = () => ({ clip: !!A.clip, t: A.t, view, cam: camera.position.toArray().map((x) => +x.toFixed(2)), hr: A.bones.hand_r.getWorldPosition(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), cheek: H.point("cheekL").toArray().map((x) => +x.toFixed(2)), eyes: H.point("eyes").toArray().map((x) => +x.toFixed(2)), vis: A.root.visible, sh: A.bones.upperarm_r.getWorldPosition(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), el: A.bones.lowerarm_r.getWorldPosition(new THREE.Vector3()).toArray().map((x) => +x.toFixed(2)), root: A.root.position.toArray().map((x) => +x.toFixed(2)) });
$('go').disabled = false; $('go').textContent = t('start');
if (q.has('step')) window.__step(2);
window.__ready = true;
