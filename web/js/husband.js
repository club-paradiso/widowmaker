// 묶인 사람(기본: 남편). GLB 를 읽고, 두 팔을 머리 위로 묶어 천장 고리에 매단 자세를 매 프레임 IK 로 잡는다.
// 표정(ARKit 52)·거짓말 버릇·눈 깜빡임·시선·말하는 입·머리 스프링·피부 상태(볼의 붉음·창백·젖음)를 맡는다.
import * as THREE from 'three';
import { makeFur } from './fur.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { V3, captureRest, aim, twoBone, setWorldQ, clamp, smooth, damp, lerp } from './rig.js';
import { vq } from './version.js';
import { syllables } from './lipsync.js';

const DEG = Math.PI / 180;
const blank1 = (r, g, b, a) => { const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1); t.needsUpdate = true; return t; };

// 피부: 빛이 피부 안으로 조금 번지는 부드러운 음영(SSS 흉내)
function skinChunk() {
  const src = THREE.ShaderChunk.lights_physical_pars_fragment;
  const line = 'reflectedLight.directDiffuse += irradiance * diffuseBRDF * ( 1.0 - F );';
  if (!src.includes(line)) return src; // three 판이 바뀌어 못 찾으면 그대로
  return src.replace(line, `float wNL = dot( geometryNormal, directLight.direction );
	vec3 wIrr = directLight.color * ( saturate( ( wNL + 0.35 ) / 1.35 ) + vec3( 0.34, 0.09, 0.05 ) * saturate( 0.35 - abs( wNL - 0.05 ) ) );
	reflectedLight.directDiffuse += wIrr * diffuseBRDF * ( 1.0 - F );`);
}

export async function loadHusband(scene, { url = './assets/husband.glb', envTex = null, faces, ageTex = null } = {}) {
  const [gltf, ageMap] = await Promise.all([
    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(vq(url)),
    ageTex ? new THREE.TextureLoader().loadAsync(vq(ageTex)).catch(() => null) : Promise.resolve(null),
  ]);
  if (ageMap) { ageMap.colorSpace = THREE.SRGBColorSpace; ageMap.flipY = false; }
  // 모공 질감(사용자 제공 art/user/03): 피부 UV 를 촘촘히 반복해 결을 더한다. 읽기 전에는 회색 1px(영향 없음)
  const poreTex = new THREE.DataTexture(new Uint8Array([168, 168, 168, 255]), 1, 1); poreTex.needsUpdate = true;
  const U_PORE = { value: poreTex };
  new THREE.TextureLoader().load(vq('./assets/skin_pore.webp'), (t) => { t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 8; U_PORE.value = t; }, undefined, () => {});
  const root = gltf.scene;
  scene.add(root);
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const rest = captureRest(root, bones);
  const H = { root, bones, rest, faces };

  // ---------- 재질
  const U = {
    red: { value: [V3(), V3()] }, redK: { value: [0, 0] }, pale: { value: 0 }, wet: { value: 0 }, bruise: { value: 0 },
    wear: { value: new THREE.Vector2(1, 1) }, ageMap: { value: ageMap }, ageK: { value: 0 },
    hair: { value: blank1(0, 0, 0, 0) }, cav: { value: blank1(128, 128, 128, 255) }, scalp: { value: blank1(0, 0, 0, 255) }, hairK: { value: 0.5 }, beardK: { value: 0.4 }, hairGrey: { value: 0 }, sweat: { value: 0 },
  };
  // 털·수염·땀 구역 지도(tools/bake_hair.py 로 구움): R 몸 털, G 수염, B 땀 구역, A 수염 그늘
  // 오목한 곳 그늘(쇄골·겨드랑이·근육 골): tools/bake_cavity.py
  new THREE.TextureLoader().load(vq('./assets/body_cavity.png'), (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; U.cav.value = t; }, undefined, () => {});
  // 두피 그늘: 머리카락 사이로 맨살이 비치던 곳(앞머리 틈 등)을 머리색으로 깐다
  new THREE.TextureLoader().load(vq('./assets/scalp.png'), (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; U.scalp.value = t; }, undefined, () => {});
  new THREE.TextureLoader().load(vq('./assets/body_hair.png'), (t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; U.hair.value = t; }, undefined, () => {});
  const morphMeshes = [], hair = [], wearTop = [], wearBottom = [], under = { briefs: null, bra: null };
  let skin = null;
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    o.castShadow = true; o.receiveShadow = true;
    const m = o.material;
    const name = m.name || '';
    if (o.morphTargetDictionary) morphMeshes.push(o);
    if (/top$/.test(o.name)) wearTop.push(o); // GLTFLoader 가 이름의 "." 을 지운다(…03.top → …03top)
    if (/bottom$/.test(o.name)) wearBottom.push(o);
    if (/^underwear\./.test(name)) { under[o.name.startsWith('bra') ? 'bra' : 'briefs'] = o; m.roughness = 0.85; m.color.setRGB(0.045, 0.045, 0.05); o.visible = false; }
    if (/^hair\./.test(name)) {
      // 머리카락: 결 방향으로 은은한 광(시엔)을 주는 물리 재질로 바꿔 덜 뭉쳐 보이게
      const hp = new THREE.MeshPhysicalMaterial({ map: m.map, color: m.color, envMapIntensity: 0.15, specularIntensity: 0.35, alphaTest: 0.12, alphaToCoverage: true, side: THREE.DoubleSide, roughness: 0.75, sheen: 0.0, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.22, 0.19, 0.16), name: m.name });
      hp.color.multiply(new THREE.Color(0.085, 0.078, 0.075)); // 참고 사진(01·02)처럼 짙은 흑발
      // 머리 텍스처의 투명한 가장자리 색(파르스름)이 비치지 않게 색을 무채색 밝기로만 쓴다
      hp.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb = vec3( dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) ) ) * vec3( 1.0, 0.93, 0.86 );'); };
      if (/bob|long|ponytail|braid/.test(name)) hp.color.setRGB(0.2, 0.15, 0.12);
      o.material = hp;
      hair.push(o);
    } else if (/^(eyebrows|eyelashes)\./.test(name)) {
      m.transparent = true; m.depthWrite = false; m.alphaTest = 0.05; o.renderOrder = 2; o.castShadow = false;
    } else if (/^eyes\./.test(name)) {
      // 눈: 물기 있는 각막(클리어코트)으로 반사점이 맺히게 → 눈에 생기가 돈다
      const e = new THREE.MeshPhysicalMaterial({ map: m.map, color: m.color.clone().multiply(new THREE.Color(0.72, 0.76, 0.8)), alphaTest: 0.3, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.2, name: m.name });
      o.material = e;
    } else if (/^(teeth|tongue)\./.test(name)) {
      m.envMapIntensity = 0.05; m.roughness = 0.5; m.color.multiply(new THREE.Color(0.7, 0.66, 0.6));
    } else if (/^clothes\./.test(name)) {
      m.roughness = 0.88;
      // 머리 위 펜던트와 든 팔이 가까워 소매에 생기는 자기 그림자의 톱니 경계가 찢어진 천처럼 보였다 → 옷은 그림자를 받지 않는다(던지는 것은 유지)
      o.receiveShadow = false;
      // 셔츠·바지 천(사용자 제작 art/user/11·12): 원래 줄무늬 셔츠·청바지 무늬를 옅은 하늘색 옥스퍼드 셔츠·차콜 바지로 바꾼다. 신발은 그대로
      const fab = /suit/.test(name) ? (/top$/.test(o.name) ? 'fab_shirt' : /bottom$/.test(o.name) ? 'fab_trouser' : null) : null;
      if (fab) {
        const c = m.clone(); o.material = c; if (fab === 'fab_trouser') c.color.setRGB(0.55, 0.55, 0.57); else c.color.setRGB(0.66, 0.74, 0.92); // 따뜻한 조명 아래서도 하늘색이 남게
        // 펜던트 바로 아래라 밝은 천이 하얗게 타지 않게 밝은 쪽만 부드럽게 눌러 준다(색은 유지)
        c.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <tonemapping_fragment>', '{ float L = max( max( gl_FragColor.r, gl_FragColor.g ), gl_FragColor.b ); if ( L > 0.0 ) gl_FragColor.rgb *= ( 1.7 * L / ( 1.0 + 1.7 * L ) ) / L; }\n#include <tonemapping_fragment>'); };
        new THREE.TextureLoader().load(vq(`./assets/${fab}.webp`), (t) => { t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; const rp = fab === 'fab_trouser' ? 4 : 2.5; t.repeat.set(rp, rp); t.anisotropy = 8; c.map = t; c.needsUpdate = true; }, undefined, () => {}); // 촘촘하면 멀리서 짜임이 가로 줄무늬(모아레)로 보인다
      }
    } else if (/^body\./.test(name)) {
      const p = new THREE.MeshPhysicalMaterial({
        map: m.map, roughness: 0.62, metalness: 0, ior: 1.4, sheen: 0.25, sheenRoughness: 0.7,
        sheenColor: new THREE.Color(1.0, 0.8, 0.72), color: new THREE.Color(0.97, 0.92, 0.9),
      });
      p.name = name;
      // 모공 요철(사용자 제공 art/user/03 에서 만든 노멀맵). 몸 UV 를 촘촘히 반복한다
      p.normalScale = new THREE.Vector2(0.65, 0.65);
      new THREE.TextureLoader().load(vq('./assets/skin_pore_n.webp'), (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(36, 24); t.anisotropy = 8; p.normalMap = t; p.needsUpdate = true; }, undefined, () => {});
      if (envTex) { p.envMap = envTex; p.envMapIntensity = 0.5; }
      p.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, { uRed: U.red, uRedK: U.redK, uPale: U.pale, uWet: U.wet, uBruise: U.bruise, uWear: U.wear, uAgeMap: U.ageMap, uAgeK: U.ageK, uPore: U_PORE, uHair: U.hair, uHairK: U.hairK, uBeardK: U.beardK, uHairGrey: U.hairGrey, uSweat: U.sweat, uScalp: U.scalp, uCav: U.cav });
        if (ageMap) sh.defines = { ...(sh.defines || {}), AGE_MAP: '' };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nattribute vec2 _hide;\nvarying vec2 vHide;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\nvHide = _hide;');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec2 vHide;\nuniform vec2 uWear;\nuniform sampler2D uAgeMap;\nuniform float uAgeK;\nuniform vec3 uRed[2];\nuniform float uRedK[2];\nuniform float uPale;\nuniform float uWet;\nuniform float uBruise;\nuniform sampler2D uPore;\nfloat poreK = 1.0;\nuniform sampler2D uHair;\nuniform float uHairK;\nuniform float uBeardK;\nuniform float uHairGrey;\nuniform float uSweat;\nuniform sampler2D uScalp;\nuniform sampler2D uCav;\nfloat wetL = 0.0;\nfloat drop = 0.0;\nfloat hairA = 0.0;\nfloat scalpK = 0.0;\nfloat hairH = 0.0;\nvec2 dropG = vec2( 0.0 );\nfloat dropK = 0.0;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
	// 옷 밑의 몸은 옷을 입은 동안 그리지 않는다(옷을 벗기면 보인다)
	if ( ( vHide.x > 0.5 && uWear.x > 0.5 ) || ( vHide.y > 0.5 && uWear.y > 0.5 ) ) discard;`)
          .replace('#include <map_fragment>', `#include <map_fragment>
	#ifdef AGE_MAP
	diffuseColor.rgb = mix( diffuseColor.rgb, texture2D( uAgeMap, vMapUv ).rgb * diffuse, uAgeK );
	#endif
	{ float pl = clamp( 1.0 + ( dot( texture2D( uPore, vMapUv * vec2( 36.0, 24.0 ) ).rgb, vec3( 0.3, 0.59, 0.11 ) ) / 0.735 - 1.0 ) * 6.0, 0.6, 1.4 ); poreK = pl; diffuseColor.rgb *= mix( 1.0, pl, 0.5 ); }
	diffuseColor.rgb *= clamp( 1.0 + ( texture2D( uCav, vMapUv ).r - 0.5 ) * 0.7, 0.68, 1.08 ); // 근육 사이 골·쇄골 아래가 깊어 보이게
	// 털·수염(나이에 따라 세기), 수염 그늘, 땀
	{ vec4 hm = texture2D( uHair, vMapUv );
	  hairA = clamp( hm.r * uHairK + hm.g * uBeardK, 0.0, 1.0 );
	  hairH = hairA;
	  vec3 hairC = mix( vec3( 0.032, 0.026, 0.022 ), vec3( 0.42, 0.40, 0.38 ), uHairGrey );
	  diffuseColor.rgb *= 1.0 - hm.a * uBeardK * 0.18;
	  diffuseColor.rgb = mix( diffuseColor.rgb, hairC, hairA * 0.88 );
	  scalpK = smoothstep( 0.5, 0.85, texture2D( uScalp, vMapUv ).r );
	  diffuseColor.rgb = mix( diffuseColor.rgb, mix( vec3( 0.02, 0.018, 0.016 ), vec3( 0.3, 0.29, 0.28 ), uHairGrey ), scalpK * 0.97 );
	  wetL = clamp( uWet + uSweat * hm.b, 0.0, 1.0 );
	  vec2 dc = vMapUv * 300.0; vec2 ci = floor( dc ); vec2 cf = fract( dc ) - 0.5;
	  float rn = fract( sin( dot( ci, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	  vec2 off = vec2( fract( rn * 17.3 ), fract( rn * 31.7 ) ) - 0.5;
	  float rad = 0.16 + 0.18 * fract( rn * 7.1 );
	  vec2 dv = cf - off * 0.45; float dl = max( length( dv ), 1e-4 );
	  float on = step( rn, wetL * 0.6 );
	  drop = on * smoothstep( rad, rad * 0.45, dl );
	  // 반구 모양 방울: 가장자리로 갈수록 기울기가 커진다. 멀리서는(화소보다 작으면) 끈다
	  dropG = on * ( dl < rad ? dv / dl * ( dl / rad ) / sqrt( max( 1.0 - ( dl / rad ) * ( dl / rad ), 0.05 ) ) : vec2( 0.0 ) );
	  dropK = 0.9 * ( 1.0 - smoothstep( 0.25, 0.6, length( fwidth( dc ) ) ) );
	  diffuseColor.rgb *= 1.0 - wetL * 0.07; }
	float lum = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum ) * vec3( 0.96, 0.99, 1.05 ) * 1.04, uPale * 0.6 );
	float red = 0.0;
	for ( int i = 0; i < 2; i ++ ) red += uRedK[ i ] * ( 1.0 - smoothstep( 0.012, 0.06, length( vWPos - uRed[ i ] ) ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.22, 0.6, 0.56 ), clamp( red, 0.0, 1.0 ) * 0.7 );`)
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	// 땀방울: 둥근 높이를 화면 기울기로 바꿔 법선을 기울인다 → 방울마다 볼록한 하이라이트
	// 땀방울 법선: 방울 모양의 기울기를 해석적으로 구해 UV 접평면으로 옮긴다(화면 미분 블록 없이)
	if ( dropK > 0.0 ) {
	  vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
	  vec2 st0 = dFdx( vMapUv ), st1 = dFdy( vMapUv );
	  vec3 q1perp = cross( q1, normal ), q0perp = cross( normal, q0 );
	  vec3 T = q1perp * st0.x + q0perp * st1.x, B = q1perp * st0.y + q0perp * st1.y;
	  float det = max( dot( T, T ), dot( B, B ) );
	  float sc = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
	  normal = normalize( normal - ( dropG.x * T * sc + dropG.y * B * sc ) * dropK );
	}`)
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor * ( 1.12 - 0.12 * poreK ), 0.24, wetL );\nroughnessFactor = mix( roughnessFactor, 0.05, drop * step( 0.001, dropK ) );\nroughnessFactor = mix( roughnessFactor, 0.8, hairA );\nroughnessFactor = mix( roughnessFactor, 1.0, scalpK );')
          .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_SHEEN\nmaterial.sheenColor *= 1.0 - scalpK;\n#endif\nmaterial.specularColor *= 1.0 - 0.85 * scalpK;')
          .replace('#include <lights_physical_pars_fragment>', skinChunk());
      };
      o.material = p;
      skin = o;
    }
    if (envTex && o.material.envMap === null && 'envMap' in o.material) { o.material.envMap = envTex; o.material.envMapIntensity ??= 0.6; }
  });
  H.skin = skin;
  H.hair = hair;

  // ---------- 손: 손바닥 방향과 손가락 굽힘 축(쉬는 자세 기준)
  const FING = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  const hands = {};
  for (const s of ['l', 'r']) {
    const P = (n) => rest[`${n}_${s}`].p;
    const g = P('middle_01').clone().sub(rest[`hand_${s}`].p).normalize(); // 손가락 방향
    const across = P('index_01').clone().sub(P('pinky_01')); // 검지 → 새끼 반대(엄지 쪽)
    // 손바닥 법선: 왼손(+x)과 오른손(-x)은 거울
    const n = (s === 'l' ? g.clone().cross(across) : across.clone().cross(g)).normalize();
    const curlAxis = {};
    for (const f of FING) for (const k of ['01', '02', '03']) {
      const b = `${f}_${k}_${s}`;
      if (!rest[b]) continue;
      const d = rest[b].dir;
      const nn = f === 'thumb' ? n.clone().addScaledVector(across.clone().normalize(), -0.6).normalize() : n;
      const axW = d.clone().cross(nn).normalize(); // dir 을 손바닥 쪽으로 돌리는 축
      curlAxis[b] = axW.applyQuaternion(rest[b].q.clone().invert()); // 뼈 로컬 축
    }
    hands[s] = { g, n, across: across.normalize(), curlAxis };
  }
  H.hands = hands;
  function setCurl(s, curl, thumb = curl * 0.6) {
    for (const [b, ax] of Object.entries(hands[s].curlAxis)) {
      const isThumb = b.startsWith('thumb');
      const k = b.includes('_01_') ? (isThumb ? 0.2 : 0.9) : b.includes('_02_') ? 1.1 : 0.8;
      const a = (isThumb ? thumb : curl) * k * 1.25;
      bones[b].quaternion.copy(rest[b].localQ).multiply(new THREE.Quaternion().setFromAxisAngle(ax, a));
    }
  }

  // ---------- 머리 위로 묶은 자세
  const headTop = rest.head.p.clone().add(V3(0, 0.22, 0));
  const hook = V3(0, rest.head.p.y + 0.62, 0.02); // 천장 고리(월드)
  const S = {
    tension: 1,     // 0: 줄을 늦춤(팔이 조금 내려옴) 1: 보통 2: 당김(까치발)
    sag: 0,         // 지침 0~1: 머리·몸이 처진다
    dead: false,
    head: { yaw: 0, pitch: 0, roll: 0, vy: 0, vp: 0, vr: 0, gy: 0, gp: 0, gr: 0 },
    look: null,     // 바라볼 월드 위치(카메라 등)
    lookK: 1,
    tremble: 0,     // 떨림 0~1
    shock: 0,       // 전기 남은 시간(초)
    sway: 0, t: 0,
    curl: 0.55,
    lift: 0, liftCur: 0,
    tensionCur: 1,
  };
  H.state = S;
  H.hook = hook;

  const wristTarget = (s, t) => {
    // 손목은 고리 바로 아래. 두 손목을 붙여 묶었다
    const drop = lerp(0.36, 0.17, t / 2);
    return V3(s === 'l' ? 0.03 : -0.03, hook.y - drop, hook.z + 0.01);
  };
  H.hookFor = () => hook;

  function pose(dt) {
    S.t += dt;
    S.tensionCur = damp(S.tensionCur, S.tension, 2.5, dt);
    // 몸 전체를 살짝 들어 올리거나(당김) 내린다(지침)
    const t = S.tensionCur;
    const lift = Math.max(0, t - 1) * 0.045 - S.sag * 0.035;
    S.liftCur = damp(S.liftCur, lift, 3, dt);
    for (const n of Object.keys(bones)) { bones[n].quaternion.copy(rest[n].localQ); bones[n].position.copy(rest[n].localP); }
    const sway = Math.sin(S.t * 0.9) * 0.012 * (0.4 + S.sag) + (S.shock > 0 ? (Math.random() - 0.5) * 0.01 : 0);
    bones.pelvis.position.y += S.liftCur;
    bones.pelvis.position.x += sway;
    root.updateMatrixWorld(true);
    // 몸통: 팔이 올라가 가슴이 들리고, 지치면 앞으로 처진다
    const breath = Math.sin(S.t * (S.shock > 0 ? 9 : 1.6 + S.sag)) * 0.02;
    const lean = (-4 + 10 * S.sag) * DEG;
    for (const [n, k] of [['spine_01', 0.3], ['spine_02', 0.35], ['spine_03', 0.35]]) {
      bones[n].rotateX(lean * k + breath * k);
    }
    // 무릎: 지치면 조금 굽는다(매달림)
    const knee = (4 + 16 * S.sag) * DEG;
    for (const s of ['l', 'r']) {
      bones[`thigh_${s}`].rotateX(-knee * 0.5);
      bones[`calf_${s}`].rotateX(knee);
      bones[`foot_${s}`].rotateX(-knee * 0.5 + Math.max(0, t - 1.2) * 0.5);
    }
    root.updateMatrixWorld(true);
    // 쇄골: 팔을 들면 같이 올라간다
    for (const s of ['l', 'r']) {
      const c = bones[`clavicle_${s}`], rc = rest[`clavicle_${s}`];
      const up = rc.dir.clone(); up.y += 0.55 + 0.1 * t; up.normalize();
      aim(c, rc, rc.dir, V3(0, 0, 1), up, V3(0, 0, 1));
    }
    root.updateMatrixWorld(true);
    // 팔: 2본 IK. 팔꿈치는 옆·조금 앞으로
    for (const s of ['l', 'r']) {
      const x = s === 'l' ? 1 : -1;
      const T = wristTarget(s, t);
      twoBone(bones[`upperarm_${s}`], bones[`lowerarm_${s}`], rest[`upperarm_${s}`], rest[`lowerarm_${s}`], T, V3(x, -0.1, 0.35));
      // 손: 손가락은 위로, 손바닥은 마주 보게(엄지는 앞)
      const h = bones[`hand_${s}`], rh = rest[`hand_${s}`], hd = hands[s];
      root.updateMatrixWorld(true);
      const fingersUp = V3(-x * 0.12, 1, 0.05).normalize();
      const palm = V3(-x, 0, 0);
      setWorldQ(h, rh.q.clone()); // 쉬는 손 → 아래에서 틀 맞춤
      aimHand(h, rh, hd, fingersUp, palm);
      setCurl(s, S.curl + (S.shock > 0 ? 0.3 : 0), S.curl * 0.8);
    }
    root.updateMatrixWorld(true);
    // 머리: 스프링 + 바라보기 + 처짐
    headSpring(dt);
  }
  function aimHand(h, rh, hd, g1, n1) {
    // 쉬는 (손가락 방향 g, 손바닥 n) → 새 (g1, n1)
    const m0 = new THREE.Matrix4().makeBasis(hd.g, hd.n, hd.g.clone().cross(hd.n).normalize());
    const n1o = n1.clone().addScaledVector(g1, -n1.dot(g1)).normalize();
    const m1 = new THREE.Matrix4().makeBasis(g1, n1o, g1.clone().cross(n1o).normalize());
    const q = new THREE.Quaternion().setFromRotationMatrix(m1.multiply(m0.invert())).multiply(rh.q.clone());
    setWorldQ(h, q);
  }

  // ---------- 머리 스프링
  const neck = bones.neck_01, head = bones.head;
  function headSpring(dt) {
    const hs = S.head;
    let gy = hs.gy, gp = hs.gp, gr = hs.gr;
    if (S.look && !S.dead) {
      const hp = head.getWorldPosition(V3());
      const d = S.look.clone().sub(hp);
      gy += clamp(Math.atan2(d.x, d.z), -0.7, 0.7) * S.lookK;
      gp += clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.5) * S.lookK;
    }
    gp += S.sag * 0.55 + (S.dead ? 0.75 : 0);
    gr += S.dead ? 0.25 : Math.sin(S.t * 0.7) * 0.03 * S.sag;
    const k = S.dead ? 6 : 26, c = S.dead ? 5 : 7.5;
    hs.vy += (k * (gy - hs.yaw) - c * hs.vy) * dt;
    hs.vp += (k * (gp - hs.pitch) - c * hs.vp) * dt;
    hs.vr += (k * (gr - hs.roll) - c * hs.vr) * dt;
    hs.yaw += hs.vy * dt; hs.pitch += hs.vp * dt; hs.roll += hs.vr * dt;
    let tr = 0;
    if (S.tremble > 0 && !S.dead) tr = S.tremble * 0.012;
    if (S.shock > 0) { tr = 0.05; S.shock -= dt; }
    const jy = (Math.random() - 0.5) * tr, jp = (Math.random() - 0.5) * tr;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((hs.pitch + jp) * 0.4, (hs.yaw + jy) * 0.4, hs.roll * 0.4, 'YXZ'));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler((hs.pitch + jp) * 0.6, (hs.yaw + jy) * 0.6, hs.roll * 0.6, 'YXZ'));
    setWorldQ(neck, q.multiply(neck.getWorldQuaternion(new THREE.Quaternion())));
    setWorldQ(head, q2.multiply(head.getWorldQuaternion(new THREE.Quaternion())));
  }
  // 반응: 'slap'(왼뺨을 맞아 오른쪽으로) 'slapR' 'flinch' 'droop' 'up' 'shake' 'nod'
  H.react = (kind, power = 1) => {
    const hs = S.head;
    if (kind === 'slap') { hs.vy -= 9 * power; hs.vr += 3 * power; hs.vp -= 1 * power; }
    else if (kind === 'slapR') { hs.vy += 9 * power; hs.vr -= 3 * power; }
    else if (kind === 'flinch') { hs.vp -= 4 * power; hs.vy += (Math.random() - 0.5) * 3; }
    else if (kind === 'hit') { hs.vp += 6 * power; }
    else if (kind === 'shake') { hs.vy += 6; setTimeout(() => (hs.vy -= 11), 160); setTimeout(() => (hs.vy += 9), 330); }
    else if (kind === 'nod') { hs.vp += 5; }
  };
  H.setHeadGoal = (yaw = 0, pitch = 0, roll = 0) => { S.head.gy = yaw; S.head.gp = pitch; S.head.gr = roll; };

  // ---------- 얼굴
  const F = { cur: {}, goal: {}, tell: null, tellT: 0, blinkT: 2, blinkS: -1, burst: 0, gaze: [0, 0], gazeGoal: [0, 0], gazeT: 1, talk: null, talkT: 0, mouthShut: false };
  H.face = F;
  const NAMES = new Set(morphMeshes.flatMap((m) => Object.keys(m.morphTargetDictionary)));
  H.setExpr = (name, k = 1) => {
    const e = faces.faces[name] || {};
    F.goal = {};
    for (const [n, v] of Object.entries(e.keys || {})) F.goal[n] = v * k;
    if (e.gaze) F.gazeGoal = e.gaze;
    F.exprName = name;
  };
  H.tell = (name) => { if (faces.tells[name]) { F.tell = name; F.tellT = 0; if (name === 'blink_burst') F.burst = 3; } };
  H.say = (text, lang, dur, env) => { F.talk = syllables(text, lang); F.talkT = 0; F.talkDur = dur || Math.max(0.6, F.talk.length * 0.11); F.env = env || null; };
  H.stopTalk = () => { F.talk = null; };
  const tellEnv = (x) => (x < 0.18 ? smooth(x / 0.18) : x < 0.6 ? 1 : smooth(Math.max(0, (1 - x) / 0.4)));
  const VIS = {
    a: { jawOpen: 0.38, mouthLowerDownLeft: 0.18, mouthLowerDownRight: 0.18 },
    i: { jawOpen: 0.1, mouthStretchLeft: 0.32, mouthStretchRight: 0.32, mouthSmileLeft: 0.08, mouthSmileRight: 0.08 },
    u: { jawOpen: 0.12, mouthPucker: 0.55, mouthFunnel: 0.28 },
    e: { jawOpen: 0.24, mouthStretchLeft: 0.2, mouthStretchRight: 0.2 },
    o: { jawOpen: 0.28, mouthFunnel: 0.45, mouthPucker: 0.22 },
    m: { mouthPressLeft: 0.45, mouthPressRight: 0.45, mouthClose: 0.35 },
    n: { jawOpen: 0.04, mouthClose: 0.2 },
    f: { mouthRollLower: 0.4, jawOpen: 0.06, mouthUpperUpLeft: 0.15, mouthUpperUpRight: 0.15 },
  };
  function faceUpdate(dt) {
    const out = {};
    const add = (o, k = 1) => { for (const [n, v] of Object.entries(o)) out[n] = (out[n] || 0) + v * k; };
    // 표정(부드럽게 따라감)
    for (const n of new Set([...Object.keys(F.cur), ...Object.keys(F.goal)])) {
      F.cur[n] = damp(F.cur[n] || 0, F.goal[n] || 0, 6, dt);
    }
    add(F.cur);
    // 버릇(0.9초 동안 잠깐)
    if (F.tell) {
      F.tellT += dt / 0.95;
      const tl = faces.tells[F.tell];
      if (F.tellT >= 1) F.tell = null;
      else {
        add(tl.keys || {}, tellEnv(F.tellT));
        if (tl.gaze) { F.gaze[0] = lerp(F.gaze[0], tl.gaze[0], 0.35); F.gaze[1] = lerp(F.gaze[1], tl.gaze[1], 0.35); }
      }
    }
    // 깜빡임
    if (!S.dead) {
      F.blinkT -= dt;
      if (F.blinkT <= 0 && F.blinkS < 0) { F.blinkS = 0; F.blinkT = F.burst > 0 ? 0.18 : 2 + Math.random() * 4; if (F.burst > 0) F.burst--; }
      if (F.blinkS >= 0) {
        F.blinkS += dt;
        const b = F.blinkS > 0.16 ? 0 : Math.sin((Math.PI * F.blinkS) / 0.16);
        out.eyeBlinkLeft = Math.max(out.eyeBlinkLeft || 0, b); out.eyeBlinkRight = Math.max(out.eyeBlinkRight || 0, b);
        if (F.blinkS > 0.16) F.blinkS = -1;
      }
    } else { out.eyeBlinkLeft = 0.55; out.eyeBlinkRight = 0.6; out.jawOpen = 0.12; }
    // 시선(가끔 흔들림)
    F.gazeT -= dt;
    if (F.gazeT < 0) { F.gazeT = 0.6 + Math.random() * 2; F.jit = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4]; }
    const gx = F.gazeGoal[0] + (F.jit ? F.jit[0] : 0), gy = F.gazeGoal[1] + (F.jit ? F.jit[1] : 0);
    F.gaze[0] = damp(F.gaze[0], gx, 12, dt); F.gaze[1] = damp(F.gaze[1], gy, 12, dt);
    const [ex, ey] = F.gaze; // 도: +x 본인의 왼쪽, +y 위
    const L = clamp(Math.abs(ex) / 30), Y = clamp(Math.abs(ey) / 25);
    if (ex > 0) { out.eyeLookOutLeft = L; out.eyeLookInRight = L; } else { out.eyeLookInLeft = L; out.eyeLookOutRight = L; }
    if (ey > 0) { out.eyeLookUpLeft = Y; out.eyeLookUpRight = Y; } else { out.eyeLookDownLeft = Y; out.eyeLookDownRight = Y; }
    // 말하는 입
    if (F.talk && !S.dead) {
      F.talkT += dt;
      const n = F.talk.length, u = F.talkT / F.talkDur;
      if (u >= 1) F.talk = null;
      else {
        const i = Math.min(n - 1, Math.floor(u * n)), fr = u * n - i;
        const sy = F.talk[i];
        let open = Math.sin(Math.PI * clamp(fr * 1.15)) * 0.85 + 0.15;
        if (F.mouthShut) open *= 0.25;
        if (sy.closeFirst && fr < 0.3) add(VIS.m, 1);
        else add(VIS[sy.v] || VIS.a, open);
      }
    }
    out.age = AGE.k;
    // 적용(0~1). 근육만 -1~1(음수 = 기본보다 마른 쪽)
    for (const m of morphMeshes) {
      const dict = m.morphTargetDictionary, inf = m.morphTargetInfluences;
      for (let i = 0; i < inf.length; i++) inf[i] = 0;
      for (const [n, v] of Object.entries(out)) { const i = dict[n]; if (i !== undefined) inf[i] = clamp(v); }
      if (dict.muscle !== undefined) inf[dict.muscle] = Math.max(-1, Math.min(1, AGE.muscle));
    }
  }

  // ---------- 피부 상태
  const SK = { red: [0, 0], redGoal: [0, 0], pale: 0, paleGoal: 0, wet: 0, sweat: 0, sweatGoal: 0 };
  H.skinState = SK; H.U = U;
  // 입체 털(셸): 몸 털·수염·두피 잔머리
  if (skin) H.fur = makeFur(skin, U, vq);
  H.slapMark = (side, k = 0.6) => { const i = side === 'L' ? 0 : 1; SK.redGoal[i] = clamp(SK.redGoal[i] + k, 0, 1); };
  H.setPale = (k) => { SK.paleGoal = clamp(k); };
  H.wet = (k = 1) => { SK.wet = Math.max(SK.wet, k); };

  // ---------- 얼굴 위 지점(머리 뼈 기준으로 쉬는 자세에서 재 둔다)
  const headInv = rest.head.q.clone().invert();
  const local = (p) => p.clone().sub(rest.head.p).applyQuaternion(headInv);
  // 정점의 월드 위치(쉬는 자세). 양자화된 GLB 는 geometry 값이 실제 크기가 아니라서 스키닝을 거쳐 구한다
  root.updateMatrixWorld(true);
  const worldVerts = (mesh) => { const out = []; const n = mesh.geometry.attributes.position.count; for (let i = 0; i < n; i++) out.push(mesh.getVertexPosition(i, V3()).applyMatrix4(mesh.matrixWorld)); return out; };
  const skinVerts = worldVerts(skin);
  const eyeL = V3(), eyeR = V3();
  let eyeMesh = null;
  root.traverse((o) => { if (o.isMesh && /^eyes\./.test(o.material.name)) eyeMesh = o; });
  if (eyeMesh) {
    let nl = 0, nr = 0;
    for (const v of worldVerts(eyeMesh)) { if (v.x > 0) { eyeL.add(v); nl++; } else { eyeR.add(v); nr++; } }
    eyeL.divideScalar(nl || 1); eyeR.divideScalar(nr || 1);
  }
  const eyeMid = eyeL.clone().add(eyeR).multiplyScalar(0.5);
  const pick = (fn) => {
    let best = null, bs = -Infinity;
    for (const v of skinVerts) { const s = fn(v); if (s > bs) { bs = s; best = v; } }
    return best;
  };
  const near = (v, y0, y1) => v.y < eyeMid.y - y0 && v.y > eyeMid.y - y1 && Math.abs(v.z - eyeMid.z) < 0.1 && v.y > eyeMid.y - 0.2;
  const P = {
    cheekL: local(pick((v) => (near(v, 0.035, 0.065) && v.x > 0 ? v.x + v.z * 0.8 : -9))),
    cheekR: local(pick((v) => (near(v, 0.035, 0.065) && v.x < 0 ? -v.x + v.z * 0.8 : -9))),
    nose: local(pick((v) => (near(v, 0.015, 0.05) && Math.abs(v.x) < 0.01 ? v.z : -9))),
    mouth: local(pick((v) => (near(v, 0.065, 0.085) && Math.abs(v.x) < 0.01 ? v.z : -9))),
    chin: local(pick((v) => (near(v, 0.105, 0.125) && Math.abs(v.x) < 0.015 ? v.z : -9))),
    eyes: local(eyeMid),
    face0: local(eyeMid.clone().add(V3(0, -0.03, 0.35))),
  };
  H.point = (name, out = V3()) => {
    if (P[name]) return out.copy(P[name]).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion())).add(head.getWorldPosition(V3()));
    const b = bones[name];
    return b ? b.getWorldPosition(out) : out;
  };
  // 머리에 붙이기: 쉬는 자세의 월드 위치(·방향)를 머리 뼈 로컬로 바꿔 붙인다(머리와 같이 움직임)
  H.attachToHead = (obj, restWorldPos, restWorldQ = new THREE.Quaternion()) => {
    obj.position.copy(local(restWorldPos));
    obj.quaternion.copy(headInv.clone().multiply(restWorldQ));
    head.add(obj);
  };
  H.eyeMidRest = eyeMid.clone();
  H.wristMid = () => bones.hand_l.getWorldPosition(V3()).add(bones.hand_r.getWorldPosition(V3())).multiplyScalar(0.5);

  // ---------- 옷과 나이
  const WEAR = { top: true, bottom: true };
  H.setClothes = ({ top = WEAR.top, bottom = WEAR.bottom } = {}) => {
    WEAR.top = top; WEAR.bottom = bottom;
    wearTop.forEach((o) => (o.visible = top)); wearBottom.forEach((o) => (o.visible = bottom));
    if (under.bra) under.bra.visible = !top;
    if (under.briefs) under.briefs.visible = !bottom; // 속옷은 늘 남는다(옷을 벗기면 보일 뿐)
    U.wear.value.set(top ? 1 : 0, bottom ? 1 : 0);
  };
  H.clothes = () => ({ ...WEAR });
  H.setClothes();
  const AGE = { k: 0, skin: 0, muscle: 0 };
  H.setAge = (age) => {
    AGE.k = Math.max(0, (age - 25) / 65); // MakeHuman: 25세 → 90세 사이
    U.ageK.value = Math.min(1, Math.max(0, (age - 30) / 16)) * 0.85; // 30대 중반부터 중년 피부 쪽으로
    for (const h of hair) { const g = Math.max(0, (age - 38) / 12) * 0.35; h.userData.grey = g; }
    // 나이에 따라: 20대는 매끈하고 마른 편, 40대로 갈수록 털·수염이 짙어지고 몸이 두꺼워진다(설계 판단)
    const t = Math.min(1, Math.max(0, (age - 20) / 25));
    U.hairK.value = 0.12 + 0.88 * t;
    U.beardK.value = 0.18 + 0.72 * t;
    U.hairGrey.value = Math.max(0, (age - 40) / 20) * 0.45;
    AGE.muscle = -0.35 + 1.1 * t;
  };
  // 땀(0~1): 긴장·고통·버틴 시간에 따라 main 이 올린다. 목·가슴·겨드랑이·이마부터 맺힌다
  H.setSweat = (k) => { SK.sweatGoal = clamp(k); };

  // ---------- 매 프레임
  H.update = (dt) => {
    pose(dt);
    faceUpdate(dt);
    SK.red[0] = damp(SK.red[0], SK.redGoal[0], 4, dt); SK.red[1] = damp(SK.red[1], SK.redGoal[1], 4, dt);
    SK.redGoal[0] = Math.max(0, SK.redGoal[0] - dt * 0.004); SK.redGoal[1] = Math.max(0, SK.redGoal[1] - dt * 0.004);
    SK.pale = damp(SK.pale, SK.paleGoal, 0.6, dt);
    SK.wet = Math.max(0, SK.wet - dt * 0.01);
    U.redK.value[0] = SK.red[0]; U.redK.value[1] = SK.red[1];
    H.point('cheekL', U.red.value[0]); H.point('cheekR', U.red.value[1]);
    SK.sweat = damp(SK.sweat, SK.sweatGoal, 0.25, dt);
    U.pale.value = SK.pale; U.wet.value = SK.wet; U.sweat.value = SK.sweat;
    for (const h of hair) {
      h.material.roughness = lerp(0.72, 0.35, SK.wet);
      if (h.userData.base === undefined) h.userData.base = h.material.color.clone();
      h.material.color.copy(h.userData.base).lerp(new THREE.Color(0.55, 0.53, 0.5), h.userData.grey || 0);
    }
  };
  H.setLook = (p, k = 1) => { S.look = p; S.lookK = k; };
  H.headTop = headTop;
  return H;
}
