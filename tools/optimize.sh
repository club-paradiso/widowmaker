#!/usr/bin/env bash
# work/*_raw.glb → web/assets/*.glb (텍스처 크기 줄이기 → WebP → meshopt 압축). glTF-Transform 4.x 필요(npx gltf-transform).
set -euo pipefail
cd "$(dirname "$0")/.."
GT=${GT:-npx gltf-transform}
mkdir -p web/assets
for n in husband wife spouse_f hands_m; do
  $GT resize work/${n}_raw.glb work/${n}_r.glb --width 2048 --height 2048
  $GT webp work/${n}_r.glb work/${n}_w.glb --quality 82
  $GT meshopt work/${n}_w.glb web/assets/${n}.glb --level medium
done
ls -la web/assets/*.glb
