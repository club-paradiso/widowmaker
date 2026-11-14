// 뼈 다루기 도구: 쉬는 자세(rest) 기억, 2본 IK, 기준틀 회전.
// 모든 뼈는 로컬 Y 축이 뼈 방향(Blender 규칙). tools/build_human.py 가 그렇게 만든다.
import * as THREE from 'three';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();

// 두 방향(주축 a, 보조축 b)으로 정한 틀을 쿼터니언으로
export function frameQ(a, b) {
  const x = a.clone().normalize();
  const z = x.clone().cross(b).normalize();
  const y = z.clone().cross(x).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, y, z));
}

// 쉬는 자세의 월드 값을 뼈마다 기억(뼈 이름 → { q, p, len, dir })
export function captureRest(root, bones) {
  root.updateMatrixWorld(true);
  const rest = {};
  for (const [n, b] of Object.entries(bones)) {
    const q = b.getWorldQuaternion(new THREE.Quaternion());
    const p = b.getWorldPosition(V3());
    const dir = V3(0, 1, 0).applyQuaternion(q);
    const child = b.children.find((c) => c.isBone);
    const len = child ? child.position.length() : 0.05;
    rest[n] = { q, p, dir, len, localQ: b.quaternion.clone(), localP: b.position.clone() };
  }
  return rest;
}

// 뼈의 월드 회전을 정한다(부모의 현재 월드 회전을 빼서 로컬로)
export function setWorldQ(bone, qWorld) {
  const pq = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pq.invert().multiply(qWorld));
  bone.updateMatrixWorld(true);
}

// 쉬는 자세의 (주축, 보조축) 틀을 새 (주축, 보조축) 틀로 옮기는 회전을, 쉬는 월드 회전에 곱한다
export function aim(bone, rest, axisFrom, sideFrom, axisTo, sideTo) {
  const q0 = frameQ(axisFrom, sideFrom), q1 = frameQ(axisTo, sideTo);
  const q = q1.multiply(q0.invert()).multiply(rest.q.clone());
  setWorldQ(bone, q);
}

// 2본 IK: 어깨(위팔) → 팔꿈치(아래팔) → 손목 목표. pole 은 팔꿈치가 나갈 방향(월드)
export function twoBone(upper, lower, rU, rL, target, pole) {
  const S = upper.getWorldPosition(V3());
  const a = rU.len, b = rL.len;
  const toT = target.clone().sub(S);
  let d = toT.length();
  d = Math.min(Math.max(d, Math.abs(a - b) + 1e-3), a + b - 1e-4);
  const dir = toT.normalize();
  // 팔꿈치 위치: 어깨에서 dir 로 x, pole 쪽으로 h
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const pp = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  const E = S.clone().addScaledVector(dir, x).addScaledVector(pp, h);
  const W = S.clone().addScaledVector(dir, d);
  // 쉬는 자세의 굽힘 평면(위팔·아래팔 방향)을 새 평면으로
  const restBend = rL.dir.clone().addScaledVector(rU.dir, -rL.dir.dot(rU.dir));
  if (restBend.lengthSq() < 1e-8) restBend.copy(pole);
  const upDir = E.clone().sub(S).normalize(), loDir = W.clone().sub(E).normalize();
  const newBend = loDir.clone().addScaledVector(upDir, -loDir.dot(upDir));
  if (newBend.lengthSq() < 1e-8) newBend.copy(pp);
  aim(upper, rU, rU.dir, restBend, upDir, newBend);
  // 아래팔: 위팔과 같은 굽힘 평면을 유지
  const restSideL = restBend.clone();
  aim(lower, rL, rL.dir, restSideL.addScaledVector(rL.dir, -restSideL.dot(rL.dir)), loDir, newBend.clone().addScaledVector(loDir, -newBend.dot(loDir)));
  return { E, W };
}

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const lerp = (a, b, u) => a + (b - a) * u;
export const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
