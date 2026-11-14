// 입체 털(셸 렌더링): 몸 메시를 털이 자라는 곳만 골라 얇은 껍질 여러 겹으로 다시 그리고,
// 겹마다 법선 방향으로 조금씩 띄운 뒤 가닥 모양만 남기고 버린다 → 수염과 두피 잔머리에 부피가 생긴다.
// (가슴·팔 털처럼 누워 자라는 털은 셸로 하면 점처럼 보여서 피부에 그린 가닥 + 결 방향 하이라이트로 처리)
// 밀도는 tools/bake_hair.py 가 구운 hair_density.png(R 몸 털, G 수염, B 두피). 나이(uHairK·uBeardK)와 땀(젖어 눌림)을 따른다.
import * as THREE from 'three';

const LAYERS = 16;

// 밀도 지도에서 한 곳이라도 털이 있는 삼각형만 남긴 인덱스(그리는 양을 크게 줄인다)
function furIndex(geo, img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data;
  const uv = geo.attributes.uv, n = uv.count, has = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const u = Math.min(c.width - 1, Math.max(0, Math.floor(uv.getX(i) * c.width)));
    const v = Math.min(c.height - 1, Math.max(0, Math.floor(uv.getY(i) * c.height)));
    const k = (v * c.width + u) * 4;
    has[i] = px[k + 1] > 10 || px[k + 2] > 10 ? 1 : 0; // 수염(G)·두피(B)
  }
  const src = geo.index.array, out = [];
  for (let t = 0; t < src.length; t += 3) if (has[src[t]] || has[src[t + 1]] || has[src[t + 2]]) out.push(src[t], src[t + 1], src[t + 2]);
  return out;
}

export function makeFur(skin, U, vq) {
  const group = { meshes: [], ready: false };
  new THREE.TextureLoader().load(vq('./assets/hair_density.png'), (tex) => {
    tex.flipY = false; tex.colorSpace = THREE.NoColorSpace;
    const src = skin.geometry, geo = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(src.attributes)) geo.setAttribute(k, a);
    geo.morphAttributes = src.morphAttributes; geo.morphTargetsRelative = src.morphTargetsRelative;
    geo.setIndex(furIndex(src, tex.image));
    geo.boundingSphere = src.boundingSphere; geo.boundingBox = src.boundingBox;
    const uni = {
      uDens: { value: tex }, uHairK: U.hairK, uBeardK: U.beardK, uHairGrey: U.hairGrey, uWear: U.wear, uWet: U.wet, uSweat: U.sweat,
    };
    for (let i = 1; i <= LAYERS; i++) {
      const h = i / LAYERS;
      const m = new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.78, metalness: 0, alphaToCoverage: true });
      m.customProgramCacheKey = () => 'fur-shell';
      const lay = { value: h };
      m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, uni, { uLayer: lay });
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
attribute vec2 _hide; varying vec2 vHide; varying vec2 vFurUv; varying float vLen;
uniform sampler2D uDens; uniform float uHairK; uniform float uBeardK; uniform float uLayer; uniform float uWet; uniform float uSweat;`)
          .replace('#include <skinning_vertex>', `#include <skinning_vertex>
	{ vec3 dd = texture2D( uDens, uv ).rgb;
	  // 털 길이(m): 몸 5mm, 수염 2~4mm(나이), 두피 6mm. 젖으면 눕는다
	  float len = dd.g * mix( 0.0012, 0.003, uBeardK ) + smoothstep( 0.6, 0.9, dd.b ) * 0.005; // 몸 털은 누워 자라서 셸보다 피부에 그린 가닥이 자연스럽다 → 셸은 수염·두피만
	  len *= 1.0 - 0.55 * clamp( uWet + uSweat * 0.5, 0.0, 1.0 );
	  vLen = len;
	  transformed += normalize( objectNormal ) * len * uLayer;
	  transformed.y -= len * 0.35 * uLayer * uLayer; }
	vHide = _hide; vFurUv = uv;`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
varying vec2 vHide; varying vec2 vFurUv; varying float vLen;
uniform sampler2D uDens; uniform float uHairK; uniform float uBeardK; uniform float uHairGrey; uniform float uLayer; uniform vec2 uWear;
float fh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float furA = 1.0;`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
	if ( ( vHide.x > 0.5 && uWear.x > 0.5 ) || ( vHide.y > 0.5 && uWear.y > 0.5 ) ) discard;
	if ( vLen < 0.0004 ) discard;
	{ vec3 dd = texture2D( uDens, vFurUv ).rgb;
	  // 칸마다 가닥 하나가 설 확률: 몸 털은 듬성듬성(가슴 가운데가 가장 진함), 수염은 나이에 따라
	  float dens = clamp( dd.g * ( 0.08 + 0.42 * uBeardK ) + smoothstep( 0.6, 0.9, dd.b ) * 0.85, 0.0, 1.0 );
	  float freq = 900.0 + 900.0 * dd.g;               // 수염은 더 촘촘하고 가늘게
	  vec2 c = vFurUv * freq; vec2 ci = floor( c ); vec2 cf = fract( c ) - 0.5;
	  float rn = fh( ci );
	  if ( rn > dens ) discard;
	  vec2 o = ( vec2( fh( ci + 1.7 ), fh( ci + 9.2 ) ) - 0.5 ) * 0.35;
	  float r = 0.36 * ( 1.0 - uLayer * 0.9 );       // 끝으로 갈수록 가늘다
	  float e = length( cf - o ) - r;
	  float aa = max( fwidth( e ), 1e-4 );
	  furA = 1.0 - smoothstep( -aa, aa, e );          // 가장자리를 부드럽게(MSAA 알파 커버리지)
	  if ( furA <= 0.01 ) discard; }`)
          .replace('#include <color_fragment>', `#include <color_fragment>
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.32, 0.3, 0.28 ), uHairGrey );
	diffuseColor.rgb *= mix( 0.45, 1.15, uLayer );    // 뿌리 쪽은 그늘
	diffuseColor.a = furA;`);
      };
      const mesh = new THREE.SkinnedMesh(geo, m);
      mesh.position.copy(skin.position); mesh.quaternion.copy(skin.quaternion); mesh.scale.copy(skin.scale);
      mesh.bind(skin.skeleton, skin.bindMatrix);
      mesh.morphTargetInfluences = skin.morphTargetInfluences; mesh.morphTargetDictionary = skin.morphTargetDictionary;
      mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.renderOrder = 1; mesh.name = `fur${i}`;
      skin.parent.add(mesh);
      group.meshes.push(mesh);
    }
    group.ready = true;
  }, undefined, () => {});
  group.setVisible = (v) => { for (const m of group.meshes) m.visible = v; };
  return group;
}
