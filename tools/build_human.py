#!/usr/bin/env python3
"""MakeHuman(CC0) 자산으로 사람 모델 GLB를 만든다. Blender 없이 numpy만 쓴다.

입력
  --mpfb   MPFB2 의 data 폴더 (base.obj, targets, rigs/standard)
  --assets MakeHuman 시스템 자산(CC0) 폴더 (skins, clothes, hair, eyes, ...)
  --faceunits faceunits01 의 targets/faceunits 폴더 (ARKit 52 표정)
출력
  --out    GLB 파일 (텍스처는 PNG 그대로. 압축은 tools/optimize.sh 에서)

하는 일
  1. 기본 메시(base.obj)에 체형 타깃(성별·나이·인종)을 적용
  2. 관절 위치를 joint-* 보조 메시 중심으로 계산(MPFB game_engine 리그 정의)
  3. 옷·머리·눈썹·속눈썹·눈·이·혀(.mhclo)를 몸에 맞춰 배치, 가중치와 표정을 옮김
  4. ARKit 표정 52개를 모프 타깃으로 넣음
  5. 서 있는 기본 자세로 저장(자세는 게임 코드가 런타임에 잡는다: 팔을 머리 위로 묶은 자세)

--arms-only 를 주면 팔(쇄골~손가락)만 남긴다(1인칭 화면의 아내 팔).
"""
import argparse, gzip, json, math, os, re, struct
import numpy as np

# ---------------------------------------------------------------- 읽기

def read_obj(path):
    vs, vts, faces, groups = [], [], [], []
    g = None
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            if line.startswith('v '):
                vs.append([float(x) for x in line.split()[1:4]])
            elif line.startswith('vt '):
                vts.append([float(x) for x in line.split()[1:3]])
            elif line.startswith('g '):
                g = line.split(None, 1)[1].strip()
            elif line.startswith('f '):
                vi, ti = [], []
                for tok in line.split()[1:]:
                    p = tok.split('/')
                    vi.append(int(p[0]) - 1)
                    ti.append(int(p[1]) - 1 if len(p) > 1 and p[1] else -1)
                faces.append((vi, ti))
                groups.append(g)
    return np.array(vs, np.float64), np.array(vts or [[0, 0]], np.float64), faces, groups


def read_target(path):
    op = gzip.open if path.endswith('.gz') else open
    idx, d = [], []
    with op(path, 'rt') as f:
        for line in f:
            if not line.strip() or line.startswith('#'):
                continue
            p = line.split()
            idx.append(int(p[0]))
            d.append([float(p[1]), float(p[2]), float(p[3])])
    return np.array(idx, np.int64), np.array(d, np.float64)


def read_mhmat(path):
    out = {}
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            p = line.strip().split(None, 1)
            if len(p) == 2 and not p[0].startswith('#'):
                out[p[0]] = p[1]
    return out


def read_mhclo(path):
    info = {'verts': [], 'delete': set(), 'scale': {}}
    mode = None
    with open(path, encoding='utf-8', errors='ignore') as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith('#'):
                continue
            p = s.split()
            if p[0] in ('verts',):
                mode = 'verts'; continue
            if p[0] == 'delete_verts':
                mode = 'del'; continue
            if mode == 'verts' and re.match(r'^-?\d', p[0]):
                if len(p) == 1:
                    info['verts'].append(([int(p[0])] * 3, [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
                else:
                    info['verts'].append(([int(x) for x in p[0:3]], [float(x) for x in p[3:6]], [float(x) for x in p[6:9]]))
                continue
            if mode == 'del' and re.match(r'^\d', p[0]):
                i = 0
                while i < len(p):
                    if i + 2 < len(p) and p[i + 1] == '-':
                        info['delete'].update(range(int(p[i]), int(p[i + 2]) + 1)); i += 3
                    else:
                        info['delete'].add(int(p[i])); i += 1
                continue
            # 다른 키워드 줄(material 등)은 구역을 바꾸지 않는다("verts 0" 바로 뒤에 material 이 오는 파일이 있다)
            if p[0] in ('x_scale', 'y_scale', 'z_scale'):
                info['scale'][p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
            elif p[0] in ('obj_file', 'material', 'name', 'z_depth'):
                info[p[0]] = p[1]
    return info

# ---------------------------------------------------------------- 수학

def vec_roll_to_mat3(vec, roll):
    """Blender 의 vec_roll_to_mat3 (뼈 방향+roll → 회전행렬, Y 가 뼈 방향)"""
    nor = vec / np.linalg.norm(vec)
    x, y, z = nor
    theta = 1.0 + y
    if theta > 1e-4 or abs(x) > 1e-6 or abs(z) > 1e-6:
        if theta < 1e-4:
            theta = 1e-4
        bMatrix = np.array([
            [1 - x * x / theta, -x, -x * z / theta],
            [x, y, z],
            [-x * z / theta, -z, 1 - z * z / theta],
        ]).T  # Blender 은 열 우선
    else:
        bMatrix = np.diag([-1.0, -1.0, 1.0])
    c, s = math.cos(roll), math.sin(roll)
    # roll 은 Y 축 회전
    rMatrix = np.array([[c, 0, -s], [0, 1, 0], [s, 0, c]]).T
    return bMatrix @ rMatrix


def quat_from_mat(m):
    t = np.trace(m)
    if t > 0:
        s = math.sqrt(t + 1.0) * 2
        w = 0.25 * s; x = (m[2, 1] - m[1, 2]) / s; y = (m[0, 2] - m[2, 0]) / s; z = (m[1, 0] - m[0, 1]) / s
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]:
        s = math.sqrt(1.0 + m[0, 0] - m[1, 1] - m[2, 2]) * 2
        w = (m[2, 1] - m[1, 2]) / s; x = 0.25 * s; y = (m[0, 1] + m[1, 0]) / s; z = (m[0, 2] + m[2, 0]) / s
    elif m[1, 1] > m[2, 2]:
        s = math.sqrt(1.0 + m[1, 1] - m[0, 0] - m[2, 2]) * 2
        w = (m[0, 2] - m[2, 0]) / s; x = (m[0, 1] + m[1, 0]) / s; y = 0.25 * s; z = (m[1, 2] + m[2, 1]) / s
    else:
        s = math.sqrt(1.0 + m[2, 2] - m[0, 0] - m[1, 1]) * 2
        w = (m[1, 0] - m[0, 1]) / s; x = (m[0, 2] + m[2, 0]) / s; y = (m[1, 2] + m[2, 1]) / s; z = 0.25 * s
    q = np.array([x, y, z, w]); return q / np.linalg.norm(q)

# obj(Y 위, 데시미터) → Blender(Z 위) → glTF(Y 위) 축 바꾸기. glTF = obj*0.1 이 된다
OBJ2BL = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], np.float64)  # bl = OBJ2BL @ obj
BL2GL = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], np.float64)   # gl = BL2GL @ bl

# ---------------------------------------------------------------- 사람 만들기

ARM_BONES = re.compile(r'^(clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky)_')


def build(a):
    D = a.mpfb
    base_v, base_vt, base_f, base_g = read_obj(os.path.join(D, '3dobjs/base.obj'))
    sex = 'male' if a.sex == 'male' else 'female'
    def shape(age):
        """age: 'young'(25세) 또는 'old'(90세). 성별·근육·키·인종 매크로 + 얼굴 세부 타깃"""
        Vs = base_v.copy()
        tgt = [(f'targets/macrodetails/universal-{sex}-{age}-averagemuscle-averageweight.target.gz', 1.0 - a.muscle),
               (f'targets/macrodetails/universal-{sex}-{age}-maxmuscle-averageweight.target.gz', a.muscle)]
        if a.height:
            tgt.append((f'targets/macrodetails/height/{sex}-{age}-averagemuscle-averageweight-maxheight.target.gz', a.height))
        for part in a.race.split(','):  # 예: asian:0.6,caucasian:0.4
            r, _, w = part.partition(':')
            tgt.append((f'targets/macrodetails/{r}-{sex}-{age}.target.gz', float(w or 1)))
        for extra in a.target or []:
            p_, w = extra.rsplit('=', 1); tgt.append(((p_ if p_.startswith('targets/') else 'targets/' + p_) + ('' if p_.endswith('.gz') else '.target.gz'), float(w)))
        for p_, w in tgt:
            if not w: continue
            i, d = read_target(os.path.join(D, p_))
            if len(i): Vs[i] += d * w  # 평균 체형 타깃은 비어 있다
        return Vs
    V = shape('young')
    age_delta = shape('old') - V if a.age_morph else None
    ground = V[:, 1].min()  # 나중에 발바닥을 0 에 맞춘다(아래에서 몸 메시로 다시 잼)

    # 그룹별 정점
    group_verts = {}
    for (vi, _), g in zip(base_f, base_g):
        group_verts.setdefault(g, set()).update(vi)
    body_faces = [k for k, g in enumerate(base_g) if g == 'body']
    ground = min(V[list(group_verts['body'])][:, 1])

    # 리그
    rig = json.load(open(os.path.join(D, 'rigs/standard/rig.game_engine.json')))
    wjs = json.load(open(os.path.join(D, 'rigs/standard/weights.game_engine.json')))['weights']
    def joint_pos(spec):
        if spec['strategy'] == 'CUBE':
            idx = sorted(group_verts[spec['cube_name']])
        else:
            idx = spec['vertex_indices']
        return V[idx].mean(axis=0)
    bones = list(rig.keys())
    # 부모가 먼저 오게 정렬
    order, seen = [], set()
    def visit(b):
        if b in seen: return
        p = rig[b].get('parent')
        if p: visit(p)
        seen.add(b); order.append(b)
    for b in bones: visit(b)
    bones = order
    to_gl = lambda p: (p - np.array([0, ground, 0])) * 0.1  # obj 데시미터 → glTF 미터(발바닥 0)
    world = {}
    for b in bones:
        h = joint_pos(rig[b]['head']); t = joint_pos(rig[b]['tail'])
        hb, tb = OBJ2BL @ h, OBJ2BL @ t
        R_bl = vec_roll_to_mat3(tb - hb, rig[b].get('roll', 0.0))
        R_gl = BL2GL @ R_bl
        M = np.eye(4); M[:3, :3] = R_gl; M[:3, 3] = to_gl(h)
        world[b] = M
        rig[b]['_len'] = float(np.linalg.norm(t - h) * 0.1)

    # 가중치(기본 메시 정점 → [뼈, w])
    nb = len(bones); bidx = {b: i for i, b in enumerate(bones)}
    W = np.zeros((len(V), nb), np.float32)
    for b, lst in wjs.items():
        if b not in bidx: continue
        for vi, w in lst:
            W[vi, bidx[b]] += w

    # ARKit 표정 타깃(기본 메시 기준)
    morph_names, morph_d = [], []
    if a.faceunits:
        for fn in sorted(os.listdir(a.faceunits)):
            if not fn.endswith('.target'): continue
            i, d = read_target(os.path.join(a.faceunits, fn))
            full = np.zeros_like(V); full[i] = d
            morph_names.append(fn[:-7]); morph_d.append(full)
    if age_delta is not None:  # 나이 모프: 25세 → 90세 차이. 런타임에서 (나이-25)/65 만큼 건다
        morph_names.append('age'); morph_d.append(age_delta)
    morph_d = np.array(morph_d) if morph_d else np.zeros((0,) + V.shape)

    meshes = []  # 각 원소: dict(name, pos(obj단위), uv, faces[(vi,ti)], W, morph, mat)
    S = a.assets
    proxies = []
    for kind, name, matfile in a.proxy:
        folder = os.path.join(S, kind, name)
        mh = read_mhclo(os.path.join(folder, f'{name}.mhclo'))
        pv, pvt, pf, _ = read_obj(os.path.join(folder, mh['obj_file']))
        sc = {}
        for ax, k in (('x', 0), ('y', 1), ('z', 2)):
            if ax in mh['scale']:
                i0, i1, s = mh['scale'][ax]
                sc[k] = abs(V[i0][k] - V[i1][k]) / s
            else:
                sc[k] = 1.0
        scale = np.array([sc[0], sc[1], sc[2]])
        refs = np.array([r[0] for r in mh['verts']]); ws = np.array([r[1] for r in mh['verts']]); off = np.array([r[2] for r in mh['verts']])
        pos = (V[refs] * ws[:, :, None]).sum(1) + off * scale
        pw = (W[refs] * ws[:, :, None]).sum(1)
        pm = (morph_d[:, refs] * ws[None, :, :, None]).sum(2) if len(morph_names) else np.zeros((0,) + pos.shape)
        mpath = matfile if matfile else os.path.join(folder, mh.get('material', name + '.mhmat'))
        if not os.path.isabs(mpath): mpath = os.path.join(folder, mpath) if os.path.exists(os.path.join(folder, mpath)) else os.path.join(S, mpath)
        mat = read_mhmat(mpath); mat['_dir'] = os.path.dirname(mpath)
        proxies.append(mh)
        meshes.append(dict(name=name, kind=kind, pos=pos, uv=pvt, faces=pf, W=pw, morph=pm, mat=mat, z=int(mh.get('z_depth', 50))))

    skin_mat = read_mhmat(a.skin); skin_mat['_dir'] = os.path.dirname(a.skin)
    jy = lambda name: V[sorted(group_verts[name])].mean(axis=0)[1]
    pelvisY, neckY = jy('joint-pelvis'), jy('joint-neck')
    body_v = np.array(sorted(group_verts['body']))
    if a.arms_only:
        hide = set()
        for mh in proxies: hide |= mh['delete']
        bfaces = [base_f[k] for k in body_faces if not all(v in hide for v in base_f[k][0])]
        meshes.insert(0, dict(name='body', kind='body', pos=V, uv=base_vt, faces=bfaces, W=W, morph=morph_d, mat=skin_mat, z=0))
    else:
        # 옷은 지우지 않고, 덮인 곳을 표시해 둔다(_HIDE: x=상의 밑, y=하의 밑). 옷을 벗기면 그 자리가 보인다
        waist = pelvisY + 0.8
        hideM = np.zeros((len(V), 2), np.float32)
        for (kind, name, _), mh in zip(a.proxy, proxies):
            if kind != 'clothes': continue
            for v in mh['delete']:
                if name.startswith('shoes') or V[v][1] < waist: hideM[v, 1] = 1
                else: hideM[v, 0] = 1
        # 옷 메시를 덩어리(이어진 면)별로 상의/하의로 나눈다
        split = []
        for m in meshes:
            if m['kind'] != 'clothes': split.append(m); continue
            if m['name'].startswith('shoes'):
                split.append({**m, 'name': m['name'] + '.bottom'}); continue
            parent = list(range(len(m['pos'])))
            def find(x):
                while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
                return x
            for vi, _ in m['faces']:
                for v in vi[1:]: parent[find(v)] = find(vi[0])
            comp = {}
            for f in m['faces']: comp.setdefault(find(f[0][0]), []).append(f)
            groups = {'top': [], 'bottom': []}
            for fs in comp.values():
                ys = [m['pos'][v][1] for f in fs for v in f[0]]
                groups['top' if np.mean(ys) > pelvisY else 'bottom'].extend(fs)
            for gname, fs in groups.items():
                if fs: split.append({**m, 'name': f"{m['name']}.{gname}", 'faces': fs})
        meshes = split
        bfaces = [base_f[k] for k in body_faces]
        meshes.insert(0, dict(name='body', kind='body', pos=V, uv=base_vt, faces=bfaces, W=W, morph=morph_d, mat=skin_mat, z=0, hide=hideM))
        # 속옷: 몸 면 일부를 법선 방향으로 3.5mm 띄워 만든다(항상 몸에 붙어 있음. 옷을 벗겨도 남는다)
        nrm = np.zeros_like(V)
        for vi, _ in bfaces:
            for j in range(1, len(vi) - 1):
                n = np.cross(V[vi[j]] - V[vi[0]], V[vi[j + 1]] - V[vi[0]])
                for v in (vi[0], vi[j], vi[j + 1]): nrm[v] += n
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12
        arm_cols = [bidx[b] for b in bones if ARM_BONES.match(b)]
        armw = W[:, arm_cols].sum(1)
        bv = V[body_v]
        cen = bv[(np.abs(bv[:, 0]) < 0.08) & (bv[:, 1] < pelvisY) & (bv[:, 1] > pelvisY - 3)]
        crotchY = cen[:, 1].min()
        def region_mesh(name, inside, color):
            fs = [f for f in bfaces if all(inside[v] for v in f[0])]
            pos = V + nrm * a.underwear_gap
            mat = {'name': name, 'diffuseColor': color, '_dir': ''}
            return dict(name=name, kind='underwear', pos=pos, uv=base_vt, faces=fs, W=W, morph=morph_d, mat=mat, z=0)
        y = V[:, 1]
        briefs = (y <= pelvisY + 0.75) & (y >= crotchY - 0.35) & (armw < 0.2)
        meshes.append(region_mesh('briefs', briefs, a.underwear_color))
        if sex == 'female':
            torso = (np.abs(V[:, 0]) > 0.3) & (np.abs(V[:, 0]) < 1.2) & (y > pelvisY + 2) & (y < neckY - 0.5) & (armw < 0.2)
            cand = np.where(torso & np.isin(np.arange(len(V)), body_v))[0]
            bustY = V[cand[np.argmax(V[cand][:, 2])]][1]
            bra = (y >= bustY - 0.75) & (y <= bustY + 0.6) & (armw < 0.15) & (y > pelvisY + 1.5)
            meshes.append(region_mesh('bra', bra, a.underwear_color))
        print('waist', round(waist, 2), 'crotch', round(crotchY, 2), 'meshes', [m['name'] for m in meshes])
    if a.arms_only:
        arm_cols = [bidx[b] for b in bones if ARM_BONES.match(b)]
        for m in meshes:
            Wm = m['W']; tot = Wm.sum(1) + 1e-9
            arm = Wm[:, arm_cols].sum(1) / tot
            # 쇄골은 어깨 둘레를 조금 남기려고 포함, 몸통 쪽(가슴)은 잘라낸다
            keep = arm > 0.6
            m['faces'] = [f for f in m['faces'] if all(keep[v] for v in f[0])]
        meshes = [m for m in meshes if m['faces']]

    write_glb(a.out, meshes, bones, rig, world, morph_names, ground, a)


# ---------------------------------------------------------------- GLB 쓰기

def write_glb(out, meshes, bones, rig, world, morph_names, ground, a):
    gl = {'asset': {'version': '2.0', 'generator': 'widowmaker tools/build_human.py'},
          'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [], 'meshes': [], 'materials': [], 'textures': [], 'images': [],
          'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}],
          'accessors': [], 'bufferViews': [], 'buffers': [], 'skins': []}
    blob = bytearray()

    def add_view(data, target=None):
        while len(blob) % 4: blob.append(0)
        off = len(blob); blob.extend(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        gl['bufferViews'].append(v); return len(gl['bufferViews']) - 1

    def add_acc(arr, ctype, typ, target=None, minmax=False, normalized=False):
        arr = np.ascontiguousarray(arr)
        view = add_view(arr.tobytes(), target)
        acc = {'bufferView': view, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: acc['normalized'] = True
        if minmax:
            acc['min'] = [float(x) for x in arr.min(0)]; acc['max'] = [float(x) for x in arr.max(0)]
        gl['accessors'].append(acc); return len(gl['accessors']) - 1

    img_cache = {}
    def add_image(path):
        if path in img_cache: return img_cache[path]
        data = open(path, 'rb').read()
        view = add_view(data)
        gl['images'].append({'bufferView': view, 'mimeType': 'image/png', 'name': os.path.splitext(os.path.basename(path))[0]})
        gl['textures'].append({'source': len(gl['images']) - 1, 'sampler': 0})
        img_cache[path] = len(gl['textures']) - 1
        return img_cache[path]

    def tex_path(mat, key):
        v = mat.get(key)
        if not v: return None
        for cand in (os.path.join(mat['_dir'], v), os.path.join(mat['_dir'], os.path.basename(v)), os.path.join(a.assets, v)):
            if os.path.exists(cand): return cand
        return None

    # 뼈 노드
    node_of = {}
    for b in bones:
        p = rig[b].get('parent')
        M = world[b] if not p else np.linalg.inv(world[p]) @ world[b]
        R = M[:3, :3]; T = M[:3, 3]
        gl['nodes'].append({'name': b, 'translation': [float(x) for x in T], 'rotation': [float(x) for x in quat_from_mat(R)]})
        node_of[b] = len(gl['nodes']) - 1
    for b in bones:
        p = rig[b].get('parent')
        if p: gl['nodes'][node_of[p]].setdefault('children', []).append(node_of[b])
    root_bones = [node_of[b] for b in bones if not rig[b].get('parent')]
    ibm = np.array([np.linalg.inv(world[b]).T.reshape(-1) for b in bones], np.float32)  # 열 우선
    gl['skins'].append({'joints': [node_of[b] for b in bones], 'inverseBindMatrices': add_acc(ibm, 5126, 'MAT4'), 'skeleton': root_bones[0], 'name': 'rig'})
    rig_node = {'name': 'rig', 'children': root_bones}
    gl['nodes'].append(rig_node); rig_idx = len(gl['nodes']) - 1
    gl['scenes'][0]['nodes'].append(rig_idx)

    off = np.array([0, ground, 0])
    for m in meshes:
        # 면(사각형 포함) → 삼각형, (정점, uv) 쌍마다 정점을 나눈다
        key2new, src, uvs, tris = {}, [], [], []
        for vi, ti in m['faces']:
            ids = []
            for v, t in zip(vi, ti):
                k = (v, t)
                if k not in key2new:
                    key2new[k] = len(src); src.append(v); uvs.append(m['uv'][t] if t >= 0 else [0, 0])
                ids.append(key2new[k])
            for j in range(1, len(ids) - 1):
                tris.append([ids[0], ids[j], ids[j + 1]])
        src = np.array(src); tris = np.array(tris, np.uint32)
        pos = ((m['pos'][src] - off) * 0.1).astype(np.float32)
        # 법선
        n = np.zeros_like(pos)
        fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
        for c in range(3): np.add.at(n, tris[:, c], fn)
        # 같은 위치(uv 이음매)의 법선은 합쳐서 매끈하게
        agg = np.zeros((len(m['pos']), 3)); np.add.at(agg, src, n); n = agg[src]
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        uv = np.array(uvs, np.float32); uv[:, 1] = 1.0 - uv[:, 1]
        Wm = m['W'][src]
        top = np.argsort(-Wm, axis=1)[:, :4]
        tw = np.take_along_axis(Wm, top, 1)
        s = tw.sum(1, keepdims=True); tw = np.where(s > 0, tw / np.maximum(s, 1e-9), 0)
        tw[s[:, 0] <= 0, 0] = 1.0; top[s[:, 0] <= 0, 0] = bones.index('head') if 'head' in bones else 0
        attrs = {'POSITION': add_acc(pos, 5126, 'VEC3', 34962, True), 'NORMAL': add_acc(n.astype(np.float32), 5126, 'VEC3', 34962),
                 'TEXCOORD_0': add_acc(uv, 5126, 'VEC2', 34962), 'JOINTS_0': add_acc(top.astype(np.uint16), 5123, 'VEC4', 34962),
                 'WEIGHTS_0': add_acc(tw.astype(np.float32), 5126, 'VEC4', 34962)}
        if m.get('hide') is not None:
            attrs['_HIDE'] = add_acc(m['hide'][src].astype(np.float32), 5126, 'VEC2', 34962)
        prim = {'attributes': attrs, 'indices': add_acc(tris.reshape(-1), 5125, 'SCALAR', 34963)}
        names = []
        if len(morph_names):
            prim['targets'] = []
            for k, nm in enumerate(morph_names):
                d = (m['morph'][k][src] * 0.1).astype(np.float32)
                if np.abs(d).max() < 1e-6: continue
                prim['targets'].append({'POSITION': add_acc(d, 5126, 'VEC3', 34962, True)})
                names.append(nm)
            if not prim['targets']: del prim['targets']
        mat = m['mat']
        mdef = {'name': f"{m['kind']}.{mat.get('name', m['name'])}", 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.7}}
        dc = [float(x) for x in mat.get('diffuseColor', '1 1 1').split()][:3]
        mdef['pbrMetallicRoughness']['baseColorFactor'] = [1, 1, 1, 1] if m['kind'] in ('body', 'clothes') else dc + [1]
        if m['kind'] == 'underwear': mdef['pbrMetallicRoughness']['roughnessFactor'] = 0.85
        t = tex_path(mat, 'diffuseTexture')
        if t: mdef['pbrMetallicRoughness']['baseColorTexture'] = {'index': add_image(t)}
        t = tex_path(mat, 'normalmapTexture')
        if t and not a.no_normal: mdef['normalTexture'] = {'index': add_image(t)}
        if m['kind'] in ('hair', 'eyebrows', 'eyelashes', 'eyes'):
            mdef['alphaMode'] = 'MASK'; mdef['alphaCutoff'] = 0.3; mdef['doubleSided'] = True
        gl['materials'].append(mdef)
        prim['material'] = len(gl['materials']) - 1
        mesh = {'name': m['name'], 'primitives': [prim]}
        if names:
            mesh['extras'] = {'targetNames': names}; mesh['weights'] = [0.0] * len(names)
        gl['meshes'].append(mesh)
        gl['nodes'].append({'name': m['name'], 'mesh': len(gl['meshes']) - 1, 'skin': 0})
        gl['scenes'][0]['nodes'].append(len(gl['nodes']) - 1)

    for k in ('textures', 'images'):
        if not gl[k]: del gl[k]
    if 'textures' not in gl: del gl['samplers']
    while len(blob) % 4: blob.append(0)
    gl['buffers'].append({'byteLength': len(blob)})
    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    with open(out, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(blob)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(blob), 0x004E4942)); f.write(blob)
    print('wrote', out, len(blob) // 1024, 'KB', 'meshes', [m['name'] for m in meshes], 'morphs', len(morph_names))


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--mpfb', required=True)
    ap.add_argument('--assets', required=True)
    ap.add_argument('--faceunits')
    ap.add_argument('--out', required=True)
    ap.add_argument('--sex', default='male')
    ap.add_argument('--race', default='asian:0.6,caucasian:0.4', help='인종 비율 (MakeHuman 매크로)')
    ap.add_argument('--skin', required=True, help='.mhmat 경로')
    ap.add_argument('--proxy', nargs=3, action='append', default=[], metavar=('KIND', 'NAME', 'MHMAT'), help='MHMAT 은 - 이면 기본')
    ap.add_argument('--target', action='append', help='추가 타깃 path=weight (mpfb data 기준)')
    ap.add_argument('--arms-only', action='store_true')
    ap.add_argument('--no-normal', action='store_true')
    ap.add_argument('--age-morph', action='store_true', help='25→90세 나이 모프 타깃 "age" 를 넣는다')
    ap.add_argument('--muscle', type=float, default=0.0, help='근육 0~1')
    ap.add_argument('--height', type=float, default=0.0, help='키 0~1(최대 키 타깃 비율)')
    ap.add_argument('--underwear-color', default='0.16 0.16 0.18')
    ap.add_argument('--underwear-gap', type=float, default=0.035, help='속옷이 몸에서 뜨는 거리(dm)')
    a = ap.parse_args()
    a.proxy = [(k, n, None if m == '-' else m) for k, n, m in a.proxy]
    build(a)
