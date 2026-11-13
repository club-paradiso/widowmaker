// index.html 의 ?v=… 를 지금 시각으로 바꾼다(배포 뒤 브라우저가 옛 JS·데이터·모델을 쓰지 않게). node tools/bump_version.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const f = new URL('../web/index.html', import.meta.url);
const d = new Date(); const p = (n) => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
writeFileSync(f, readFileSync(f, 'utf8').replace(/\?v=[\w-]+/g, `?v=${v}`));
console.log('version', v);
