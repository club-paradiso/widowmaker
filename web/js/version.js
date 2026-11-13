// 캐시 버전: index.html 의 importmap 에 적힌 ?v= 를 자기 URL 에서 읽는다(tools/bump_version.mjs 가 올림).
// 모델·데이터 URL 에도 같은 값을 붙여, 배포 후 브라우저가 옛 파일을 쓰지 않게 한다.
export const V = new URL(import.meta.url).searchParams.get('v') || 'dev';
export const vq = (url) => `${url}${url.includes('?') ? '&' : '?'}v=${V}`;
