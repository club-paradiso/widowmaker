#!/usr/bin/env bash
# 사람 모델 2개를 만든다(남편 전신·아내 팔). 자산 위치는 환경변수로.
#   MPFB_DATA=.../mpfb2/src/mpfb/data  MH_ASSETS=.../makehuman_system_assets  FACEUNITS=.../faceunits01/targets/faceunits
set -euo pipefail
cd "$(dirname "$0")/.."
S="$MH_ASSETS"
mkdir -p work
# 남편: 또렷한 턱선·광대, 갸름한 볼, 조금 큰 눈, 곧은 코, 근육·키 조금 더(잘생긴 쪽으로 조정한 설계 판단)
HANDSOME="chin/chin-prominent-incr=0.45 chin/chin-width-incr=0.3 chin/chin-height-incr=0.15 \
  cheek/l-cheek-bones-incr=0.4 cheek/r-cheek-bones-incr=0.4 cheek/l-cheek-volume-decr=0.35 cheek/r-cheek-volume-decr=0.35 \
  nose/nose-scale-horiz-decr=0.2 nose/nose-point-width-decr=0.3 nose/nose-hump-decr=0.3 nose/nose-scale-vert-incr=0.1 \
  eyes/l-eye-scale-incr=0.15 eyes/r-eye-scale-incr=0.15 eyes/l-eye-height2-incr=0.25 eyes/r-eye-height2-incr=0.25 \
  eyebrows/eyebrows-trans-down=0.2 mouth/mouth-lowerlip-volume-incr=0.2 neck/neck-scale-horiz-incr=0.25 head/head-oval=0.3"
TGT=(); for t in $HANDSOME; do TGT+=(--target "$t"); done
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --faceunits "$FACEUNITS" --out work/husband_raw.glb \
  --sex male --race asian:0.6,caucasian:0.4 --muscle 0.5 --height 0.35 --age-morph "${TGT[@]}" \
  --skin "$S/skins/young_asian_male/young_asian_male.mhmat" \
  --proxy clothes male_casualsuit03 - --proxy hair short02 - --proxy eyebrows eyebrow001 - --proxy eyelashes eyelashes01 - \
  --proxy eyes high-poly "$S/eyes/materials/brown.mhmat" --proxy teeth teeth_base - --proxy tongue tongue01 - --proxy clothes shoes02 -
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --out work/wife_raw.glb --arms-only \
  --sex female --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_female/young_asian_female.mhmat" \
  --proxy clothes female_casualsuit01 -
# 아내가 바람핀 판(mode w): 묶인 쪽은 아내 전신, 1인칭 팔은 남편
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --faceunits "$FACEUNITS" --out work/spouse_f_raw.glb \
  --sex female --race asian:0.55,caucasian:0.45 --muscle 0.2 --age-morph --target chin/chin-width-decr=0.2 --target eyes/l-eye-scale-incr=0.15 --target eyes/r-eye-scale-incr=0.15 --skin "$S/skins/young_asian_female/young_asian_female.mhmat" \
  --proxy clothes female_casualsuit01 - --proxy hair bob02 - --proxy eyebrows eyebrow009 - --proxy eyelashes eyelashes02 - \
  --proxy eyes high-poly "$S/eyes/materials/brown.mhmat" --proxy teeth teeth_base - --proxy tongue tongue01 - --proxy clothes shoes06 -
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --out work/hands_m_raw.glb --arms-only \
  --sex male --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_male/young_asian_male.mhmat" \
  --proxy clothes male_casualsuit01 -
