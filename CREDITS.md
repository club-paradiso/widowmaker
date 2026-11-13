# 출처와 라이선스

- **사람 모델**: [MakeHuman](http://www.makehumancommunity.org) 시스템 자산(CC0) — 기본 메시, 체형 타깃, 옷(male_casualsuit03, female_casualsuit01, 신발), 머리(short02), 눈·눈썹·속눈썹·치아·혀, 피부(young_asian_male/female).
  [faceunits01](https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html)(CC0, ARKit 52 표정 타깃).
  리그 정의(game_engine)와 가중치는 [MPFB2](https://github.com/makehumancommunity/mpfb2) 데이터에서 읽었다(MPFB2 코드는 GPL, 그 데이터로 만든 결과물은 CC0 자산 기반).
  변환은 이 저장소의 `tools/build_human.py`(Blender 없이 numpy) → [glTF-Transform](https://gltf-transform.dev)(MIT)로 압축.
- **three.js** r187 — MIT (`web/lib/three/LICENSE`).
- **글꼴** — Nanum Myeongjo, EB Garamond (Google Fonts, OFL).
- **사진 질감·키아트**: 시작 화면 키아트(`keyart*.webp`), 벽지·바닥·커튼·종이 질감, 창밖 밤·아침(`*.webp`)은 Higgsfield `gpt_image_2_6` 으로 생성(사람·상표 없음). 파일이 없으면 코드로 그린 질감으로 돌아간다.
- 방 구조·소품·소리·음악은 코드로 만들었다.
- 이 게임은 [yoshitakeapp.com 의 「浮気した夫に全部吐かせる」](https://yoshitakeapp.com/games/uwaki-jinmon/)의 공개된 구조를 분석해 **처음부터 새로 쓴 클린룸 구현**이다. 원작의 코드·대본·음성·모델·이미지는 포함하지 않는다.
