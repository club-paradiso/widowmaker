// 말 바꾸기(한국어·English). UI 문구는 data/ui.json, 대본은 data/story.json(아내판은 story_w.json 이 덮어씀).
// 문장 틀: {x} 는 vars 의 값(낱말 id 면 words 에서 찾음), {x^} 영어 첫 글자 대문자, {x|A/B} 앞말 받침 있으면 A·없으면 B.
import { vq } from './version.js';

export const LANGS = { ko: '한국어', en: 'English' };
export let lang = 'ko';
export let mode = 'h';
export let ui = {}, story = {};
let name = '';

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 저장 못 하는 환경 */ } },
};
export { store };

export function pickLang() {
  const q = new URLSearchParams(location.search).get('lang');
  const l = q || store.get('wm_lang') || ((navigator.language || 'ko').startsWith('ko') ? 'ko' : 'en');
  return l in LANGS ? l : 'ko';
}
export function pickMode() {
  const q = new URLSearchParams(location.search).get('mode') || store.get('wm_mode');
  return q === 'w' ? 'w' : 'h';
}

function merge(a, b) { // b 가 a 를 덮음(객체는 깊이)
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const o = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) o[k] = (v && typeof v === 'object' && !Array.isArray(v) && !('ko' in v)) ? merge(a?.[k], v) : v;
  return o;
}

export async function load(l = pickLang(), m = pickMode()) {
  lang = l; mode = m;
  store.set('wm_lang', l); store.set('wm_mode', m);
  document.documentElement.lang = l;
  const get = (u) => fetch(vq(u)).then((r) => (r.ok ? r.json() : {}));
  const [u, s, sw] = await Promise.all([get('./data/ui.json'), get('./data/story.json'), m === 'w' ? get('./data/story_w.json') : Promise.resolve(null)]);
  ui = u; story = sw ? merge(s, sw) : s;
  return story;
}
export const setName = (n) => { name = (n || '').trim(); };
export const spouse = (cap = false) => {
  if (name) return name;
  const p = story.pron[lang];
  return cap ? p.S : p.s;
};

const hasBatchim = (str) => {
  const ch = [...String(str).replace(/[\s.,!?…"'()]+$/g, '')].pop() || '';
  const c = ch.codePointAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return '013678'.includes(ch);
  return /[bcdfgjklmnpqrstvxz]/i.test(ch);
};
const L = (o) => (o && typeof o === 'object' && (o.ko !== undefined || o.en !== undefined) ? (o[lang] ?? o.ko) : o);

// 낱말 풀이: words 의 id, 증거 id, 질문 id 등
function resolve(key, v, vars) {
  if (v === undefined || v === null) {
    if (key === 'S') return spouse(true);
    if (key === 's') return spouse(false);
    if (key === 'treasure') return L(story.treasure);
    const p = story.pron[lang];
    if (p && p[key]) return p[key];
    return '';
  }
  if (key === 'q' || key === 'a') { const b = story.baseline.find((x) => x.id === v); return b ? L(b[key]) : ''; }
  if (key === 'ev') { const e = vars._ev && vars._ev(v); return e ? L(e.name) : ''; }
  if (key === 'excuse') return L(v);
  if (typeof v === 'string' && story.words && story.words[v]) return L(story.words[v]);
  return L(v);
}

export function fill(str, vars = {}) {
  if (typeof str !== 'string') return '';
  return str.replace(/\{(\w+)(\^)?(?:\|([^/}]*)\/([^}]*))?\}/g, (m, k, cap, a, b) => {
    if (a !== undefined) { // 조사: 앞의 값에 붙인다
      const prev = resolve(k, vars[k], vars);
      return hasBatchim(prev) ? a : b;
    }
    let r = String(resolve(k, vars[k], vars) ?? '');
    if (cap && r) r = r[0].toUpperCase() + r.slice(1);
    return r;
  });
}

// UI 문구
export function t(key, vars = {}) {
  let o = ui;
  for (const p of key.split('.')) o = o?.[p];
  if (mode === 'w') { // 아내판 문구가 따로 있으면 그쪽
    let w = ui; const ks = key.split('.'); ks[0] = ks[0] + '_w';
    for (const p of ks) w = w?.[p];
    if (w) o = w;
    if (!w && ks.length === 1 && ui[key + '_w']) o = ui[key + '_w'];
  }
  if (o === undefined) return key;
  return fill(L(o), vars);
}
// 대본 한 줄(변형 중 하나). pickIdx 는 0~1 난수(같은 판이면 같은 줄이 나오게 game 쪽에서 준다)
export function line(key, vars = {}, r = Math.random()) {
  const o = story.lines[key];
  if (!o) return '';
  const arr = L(o);
  const s = Array.isArray(arr) ? arr[Math.floor(r * arr.length) % arr.length] : arr;
  return fill(s, vars);
}
export function lines(key, vars = {}) {
  const o = story.lines[key];
  if (!o) return [];
  const arr = L(o);
  return (Array.isArray(arr) ? arr : [arr]).map((s) => fill(s, vars));
}
export const word = (id) => L(story.words?.[id]) || id;
export const loc = L;
export function won(man) { // 만 원 단위 → 표기
  if (lang === 'ko') return `${man.toLocaleString('ko-KR')}만 원`;
  return `₩${(man * 10000).toLocaleString('en-US')}`;
}
