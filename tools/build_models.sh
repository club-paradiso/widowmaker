#!/usr/bin/env bash
# 사람 모델 2개를 만든다(남편 전신·아내 팔). 자산 위치는 환경변수로.
#   MPFB_DATA=.../mpfb2/src/mpfb/data  MH_ASSETS=.../makehuman_system_assets  FACEUNITS=.../faceunits01/targets/faceunits
set -euo pipefail
cd "$(dirname "$0")/.."
S="$MH_ASSETS"
mkdir -p work
# 남편: 사용자가 준 얼굴 참고(art/user/01·02)에 맞춘 값 — 긴 계란형 얼굴, 갸름한 턱·볼, 높고 곧은 코, 짙은 일자 눈썹. 머리는 short01(넘긴 머리): short02 의 앞머리는 가닥 사이로 이마가 비쳐 보였다
HANDSOME="chin/chin-prominent-incr=0.4 chin/chin-width-incr=0.1 chin/chin-height-incr=0.2 \
  cheek/l-cheek-bones-incr=0.3 cheek/r-cheek-bones-incr=0.3 cheek/l-cheek-volume-decr=0.45 cheek/r-cheek-volume-decr=0.45 \
  nose/nose-scale-horiz-decr=0.25 nose/nose-point-width-decr=0.3 nose/nose-hump-decr=0.3 nose/nose-scale-vert-incr=0.2 \
  eyes/l-eye-scale-incr=0.05 eyes/r-eye-scale-incr=0.05 eyes/l-eye-height2-incr=0.15 eyes/r-eye-height2-incr=0.15 \
  eyebrows/eyebrows-trans-down=0.25 neck/neck-scale-horiz-incr=0.2 head/head-oval=0.5 head/head-scale-vert-incr=0.2"
TGT=(); for t in $HANDSOME; do TGT+=(--target "$t"); done
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --faceunits "$FACEUNITS" --out work/husband_raw.glb \
  --sex male --race asian:0.72,caucasian:0.28 --muscle 0.5 --height 0.35 --age-morph --muscle-morph "${TGT[@]}" \
  --skin "$S/skins/young_asian_male/young_asian_male.mhmat" \
  --proxy clothes male_casualsuit03 - --proxy hair short01 - --proxy eyebrows eyebrow008 - --proxy eyelashes eyelashes01 - \
  --proxy eyes high-poly "$S/eyes/materials/brown.mhmat" --proxy teeth teeth_base - --proxy tongue tongue01 - --proxy clothes shoes02 -
python3 -I tools/build_human.py --mpfb "$MPFB_DATA" --assets "$S" --out work/wife_raw.glb --arms-only \
  --sex female --race asian:0.55,caucasian:0.45 --skin "$S/skins/young_asian_female/young_asian_female.mhmat" \
  --proxy clothes female_casualsuit01 -
