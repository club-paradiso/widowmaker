// 화면 처리: 구석의 그림자(GTAO) → 램프 번짐(bloom) → 톤 매핑(OutputPass) → 필름 그레인·비네트·색 보정.
// 화질 'high' 는 전부, 'low'(폰·약한 기기)는 GTAO 를 빼고 해상도를 낮춘다. 'off' 는 예전처럼 바로 그린다.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.045 }, uVig: { value: 0.32 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrain; uniform float uVig; varying vec2 vUv;
    float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
    void main() {
      vec3 c = texture2D( tDiffuse, vUv ).rgb;
      // 어두운 곳은 살짝 차갑게, 밝은 곳은 따뜻하게(필름 느낌)
      float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
      c = mix( c * vec3( 0.97, 1.0, 1.04 ), c * vec3( 1.03, 1.0, 0.95 ), smoothstep( 0.15, 0.7, l ) );
      // 그레인: 중간 밝기에서 가장 보인다
      float g = h( floor( vUv * uRes ) + fract( uTime * 7.31 ) * 97.0 ) - 0.5;
      c += g * uGrain * ( 0.35 + 0.65 * ( 1.0 - abs( l - 0.45 ) * 1.6 ) );
      // 비네트
      vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y * 0.75;
      c *= 1.0 - uVig * smoothstep( 0.25, 0.85, length( d ) );
      gl_FragColor = vec4( c, 1.0 );
    }`,
};

export function makePost(renderer, scene, camera) {
  let comp = null, gtao = null, bloom = null, film = null, mode = 'off', time = 0;
  const size = new THREE.Vector2();
  function build(q) {
    if (comp) { comp.dispose(); comp = null; }
    mode = q;
    renderer.setPixelRatio(Math.min(devicePixelRatio, q === 'high' ? 2 : q === 'low' ? 1.25 : 2));
    renderer.getSize(size);
    if (q === 'off') return;
    comp = new EffectComposer(renderer);
    comp.addPass(new RenderPass(scene, camera));
    if (q === 'high') {
      gtao = new GTAOPass(scene, camera, size.x, size.y);
      gtao.blendIntensity = 0.9;
      gtao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 12 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 8 });
      comp.addPass(gtao);
    } else gtao = null;
    // 전구·창빛만 번지게: 문턱을 높게
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 6.0); // 문턱 6: 조명 받은 피부는 번지지 않고, 밝게 키운 전구만 번진다
    comp.addPass(bloom);
    comp.addPass(new OutputPass());
    film = new ShaderPass(FilmShader);
    comp.addPass(film);
    resize();
  }
  function resize() {
    if (!comp) return;
    renderer.getSize(size);
    comp.setPixelRatio(renderer.getPixelRatio());
    comp.setSize(size.x, size.y);
    film.uniforms.uRes.value.set(size.x * renderer.getPixelRatio(), size.y * renderer.getPixelRatio());
  }
  return {
    get mode() { return mode; },
    set(q) { build(q); },
    resize,
    render(dt) {
      if (!comp) { renderer.render(scene, camera); return; }
      time += dt; film.uniforms.uTime.value = time;
      comp.render(dt);
    },
  };
}

// 기본 화질: 손가락 터치가 주 입력인 작은 화면·메모리가 적은 기기는 low
export function defaultQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 820;
  const mem = navigator.deviceMemory || 8;
  return (touch && small) || mem <= 4 ? 'low' : 'high';
}
