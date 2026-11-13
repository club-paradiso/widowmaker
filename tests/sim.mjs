// 게임 규칙 검사(Node): 결정성, 끝까지 도는지, 전략별 결과 분포.  node tests/sim.mjs
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { newGame, act, available, verdict, keepGoing, isMorning, rng } from '../web/js/game.js';
const pr = rng(12345); // 정책용 난수(게임 난수를 건드리지 않게)
const story = JSON.parse(readFileSync(new URL('../web/data/story.json', import.meta.url)));

function play(st, seed, policy, maxSteps = 400) {
  const s = newGame(st, seed, { age: 20 + (seed % 30) }); const acts = [];
  let steps = 0;
  while (!s.ended && steps++ < maxSteps) {
    if (isMorning(s)) { if (s.day < 2 && policy.keep) { keepGoing(s); acts.push(['__keep']); continue; } break; }
    const av = available(s);
    const [id, arg] = policy.next(s, av);
    acts.push([id, arg]);
    act(s, id, arg);
    if (id === 'phone') for (const e of s.evidence) if (!e.found) { act(s, 'take', e.id); acts.push(['take', e.id]); }
  }
  const v = verdict(s, s.affairs.every((a) => a.confessed) ? 'pledge' : 'divorce');
  return { s, v, acts };
}
const gentle = { keep: false, next(s, av) {
  if (s.baseline < 2) return ['baseline'];
  if (!s.phoneOpened) return ['phone'];
  const ev = s.evidence.find((e) => e.found && !e.used && e.affairId !== null && !s.affairs[e.affairId].confessed);
  if (ev) return ['evidence', ev.id];
  if (s.tension > 0 && s.strain > 55) return ['rest'];
  if (s.confusion > 45) return ['recheck'];
  return [['push', 'minimize', 'silence', 'cry', 'push'][s.turn % 5]];
} };
const brutal = { keep: true, next(s, av) {
  if (av.includes('tighten')) return ['tighten'];
  return [['shock', 'slapHard', 'push', 'push'][s.turn % 4]];
} };
const random = { keep: true, next(s, av) { const id = av[Math.floor(pr() * av.length)]; if (id === 'evidence') return [id, s.evidence.find((e) => e.found && !e.used).id]; return [id]; } };

// 결정성: 같은 seed + 같은 행동 → 같은 상태
for (const seed of [1, 42, 999]) {
  const a = play(story, seed, random); const s2 = newGame(story, seed, { age: 20 + (seed % 30) });
  for (const [id, arg] of a.acts) id === '__keep' ? keepGoing(s2) : act(s2, id, arg);
  assert.equal(JSON.stringify(s2.affairs), JSON.stringify(a.s.affairs));
  assert.equal(s2.hp, a.s.hp);
}
console.log('결정성 OK');
// 모든 대사 키가 대본에 있는지
const used = new Set();
for (let seed = 1; seed <= 300; seed++) for (const pol of [gentle, brutal, random]) {
  const s = newGame(story, seed);
  let n = 0;
  while (!s.ended && !isMorning(s) && n++ < 120) {
    const av = available(s); const [id, arg] = pol.next(s, av);
    for (const ev of act(s, id, arg)) if (ev.t === 'say') used.add(ev.key);
  }
}
const missing = [...used].filter((k) => !story.lines[k]);
assert.deepEqual(missing, [], 'missing lines: ' + missing);
console.log('대사 키', used.size, '개 모두 있음');
for (const [name, pol] of Object.entries({ gentle, brutal, random })) {
  const R = { end: {}, ranks: {}, told: 0, N: 0 };
  for (let seed = 1; seed <= 500; seed++) {
    const { v } = play(story, seed * 7 + 3, pol);
    R.end[v.ended || 'verdict'] = (R.end[v.ended || 'verdict'] || 0) + 1;
    R.ranks[v.rank] = (R.ranks[v.rank] || 0) + 1; R.told += v.told; R.N += v.N;
  }
  console.log(name.padEnd(7), '결말', JSON.stringify(R.end), '등급', JSON.stringify(R.ranks), '자백률', (R.told / R.N).toFixed(2));
}
// 평소 질문의 대답은 a(답 id)를 넘겨야 대사가 비지 않는다
{ const s = newGame(story, 3); const ev = act(s, 'baseline').find((e) => e.key === 'baseline_a'); assert.ok(ev.vars.a, 'baseline_a 에 a 없음'); console.log('평소 질문 대답 OK'); }
// 옷 벗기기: 한 번씩만, 속옷은 상태에 없음(늘 남음). 나이가 많을수록 시작 체력이 낮고 어깨 부담이 빨리 쌓인다
{
  const s = newGame(story, 9, { age: 45 }); act(s, 'stripTop'); act(s, 'stripBottom');
  assert.equal(s.top, false); assert.equal(s.bottom, false);
  assert.ok(!available(s).includes('stripTop') && !available(s).includes('stripBottom'));
  const y = newGame(story, 9, { age: 22 }), o = newGame(story, 9, { age: 48 });
  for (let i = 0; i < 20; i++) { act(y, 'silence'); act(o, 'silence'); }
  assert.ok(o.hp < y.hp && o.strain > y.strain, '나이 효과');
  assert.equal(newGame(story, 1, { age: 99 }).age, 49); assert.equal(newGame(story, 1, { age: 3 }).age, 20);
  console.log('옷 벗기기·나이 OK', { young: [y.hp.toFixed(1), y.strain.toFixed(1)], old: [o.hp.toFixed(1), o.strain.toFixed(1)] });
}
