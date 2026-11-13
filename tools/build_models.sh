#!/usr/bin/env bash
# 사람 모델 2개를 만든다(남편 전신·아내 팔). 자산 위치는 환경변수로.
#   MPFB_DATA=.../mpfb2/src/mpfb/data  MH_ASSETS=.../makehuman_system_assets  FACEUNITS=.../faceunits01/targets/faceunits
set -euo pipefail
cd "$(dirname "$0")/.."
S="$MH_ASSETS"
mkdir -p work
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --faceunits "$FACEUNITS" --out work/husband_raw.glb \
  --sex male --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_male/young_asian_male.mhmat" \
  --proxy clothes male_casualsuit03 - --proxy hair short04 - --proxy eyebrows eyebrow001 - --proxy eyelashes eyelashes01 - \
  --proxy eyes high-poly "$S/eyes/materials/brown.mhmat" --proxy teeth teeth_base - --proxy tongue tongue01 - --proxy clothes shoes02 -
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --out work/wife_raw.glb --arms-only \
  --sex female --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_female/young_asian_female.mhmat" \
  --proxy clothes female_casualsuit01 -
# 아내가 바람핀 판(mode w): 묶인 쪽은 아내 전신, 1인칭 팔은 남편
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --faceunits "$FACEUNITS" --out work/spouse_f_raw.glb \
  --sex female --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_female/young_asian_female.mhmat" \
  --proxy clothes female_casualsuit01 - --proxy hair bob02 - --proxy eyebrows eyebrow009 - --proxy eyelashes eyelashes02 - \
  --proxy eyes high-poly "$S/eyes/materials/brown.mhmat" --proxy teeth teeth_base - --proxy tongue tongue01 - --proxy clothes shoes06 -
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --out work/hands_m_raw.glb --arms-only \
  --sex male --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_male/young_asian_male.mhmat" \
  --proxy clothes male_casualsuit01 -
