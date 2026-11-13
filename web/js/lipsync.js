// 글자 → 음절(모음) 열. 말하는 입을 움직이는 데 쓴다(음성 없이 자막만으로).
// 한국어: 한글 음절을 초성·중성·종성으로 나눠 중성(모음)을 a/i/u/e/o 로, ㅁ·ㅂ·ㅍ 초성은 입을 한 번 닫고 연다.
// 영어: 모음 덩어리 하나를 한 음절로 보고, 앞 자음이 m/b/p 면 닫고, f/v 면 아랫입술.
const KO_V = ['a', 'e', 'a', 'e', 'o', 'e', 'o', 'e', 'o', 'a', 'e', 'e', 'o', 'u', 'o', 'e', 'i', 'u', 'u', 'u', 'i']; // ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ
const KO_CLOSE = new Set([6, 7, 17]); // 초성 ㅁ ㅂ ㅃ ㅍ(17)
KO_CLOSE.add(8);
export function syllables(text, lang = 'ko') {
  const out = [];
  if (!text) return out;
  if (lang === 'ko') {
    for (const ch of text) {
      const c = ch.codePointAt(0);
      if (c >= 0xac00 && c <= 0xd7a3) {
        const k = c - 0xac00, cho = Math.floor(k / 588), jung = Math.floor((k % 588) / 28);
        out.push({ v: KO_V[jung] || 'a', closeFirst: KO_CLOSE.has(cho) });
      } else if (/[.,!?…~]/.test(ch) && out.length) out.push({ v: 'n', pause: true });
      else if (/[a-zA-Z]/.test(ch)) out.push({ v: 'a' });
    }
    return out;
  }
  const words = text.toLowerCase().match(/[a-z']+|[.,!?…]/g) || [];
  for (const w of words) {
    if (/^[.,!?…]$/.test(w)) { out.push({ v: 'n', pause: true }); continue; }
    const re = /([^aeiouy]*)([aeiouy]+)/g; let m, any = false;
    while ((m = re.exec(w))) {
      any = true;
      const pre = m[1], vow = m[2];
      if (vow === 'e' && re.lastIndex === w.length && out.length && any && w.length > 3) continue; // 끝의 묵음 e
      const v = /oo|u|w/.test(vow) ? 'u' : /o/.test(vow) ? 'o' : /ee|i|y/.test(vow) ? 'i' : /e/.test(vow) ? 'e' : 'a';
      out.push({ v, closeFirst: /[mbp]$/.test(pre), lip: /[fv]$/.test(pre) });
    }
    if (!any) out.push({ v: 'n' });
  }
  return out;
}
