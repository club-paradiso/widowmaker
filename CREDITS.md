# 출처와 라이선스

- **사람 모델**: [MakeHuman](http://www.makehumancommunity.org) 시스템 자산(CC0) — 기본 메시, 체형 타깃, 옷(male_casualsuit03·01, female_casualsuit01, 신발), 머리(short04·bob02), 눈·눈썹·속눈썹·치아·혀, 피부(young_asian_male/female).
  [faceunits01](https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html)(CC0, ARKit 52 표정 타깃).
  리그 정의(game_engine)와 가중치는 [MPFB2](https://github.com/makehumancommunity/mpfb2) 데이터에서 읽었다(MPFB2 코드는 GPL, 그 데이터로 만든 결과물은 CC0 자산 기반).
  변환은 이 저장소의 `tools/build_human.py`(Blender 없이 numpy) → [glTF-Transform](https://gltf-transform.dev)(MIT)로 압축.
- **three.js** r187 — MIT (`web/lib/three/LICENSE`).
- **글꼴** — Nanum Myeongjo, EB Garamond (Google Fonts, OFL).
- 방·소품·소리·음악은 모두 코드로 만들었다(외부 파일 없음).
- 이 게임은 [yoshitakeapp.com 의 「浮気した夫に全部吐かせる」](https://yoshitakeapp.com/games/uwaki-jinmon/)의 공개된 구조를 분석해 **처음부터 새로 쓴 클린룸 구현**이다. 원작의 코드·대본·음성·모델·이미지는 포함하지 않는다.
