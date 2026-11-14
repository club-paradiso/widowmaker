"""작은 GLB 읽기 도구(비압축 GLB 전용): 메시 이름별 POSITION·NORMAL·TEXCOORD_0·인덱스, 이미지 바이트."""
import json, struct, numpy as np
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def load(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]; J = json.loads(b[20:20 + jl]); off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]; BIN = b[off + 8:off + 8 + bl]
    def acc(i):
        a = J['accessors'][i]; bv = J['bufferViews'][a['bufferView']]
        o = bv.get('byteOffset', 0) + a.get('byteOffset', 0); n = NC[a['type']]; dt = CT[a['componentType']]
        arr = np.frombuffer(BIN, dtype=dt, count=a['count'] * n, offset=o)
        return arr.reshape(a['count'], n) if n > 1 else arr
    meshes = {}
    for m in J['meshes']:
        for p in m['primitives']:
            at = p['attributes']; mat = J['materials'][p['material']]['name'] if 'material' in p else ''
            meshes[mat or m['name']] = dict(pos=acc(at['POSITION']).astype(float), nrm=acc(at['NORMAL']).astype(float) if 'NORMAL' in at else None,
                uv=acc(at['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in at else None, idx=acc(p['indices']).astype(int).reshape(-1, 3))
    imgs = []
    for im in J.get('images', []):
        bv = J['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0); imgs.append((im.get('name'), BIN[o:o + bv['byteLength']]))
    return J, meshes, imgs
