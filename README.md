# WIDOWMAKER

주인공은 아내. 천장 고리에 두 손목이 묶인 남편. 들킨 건 한 명, 그는 그게 전부라고 한다. 아침이 오기 전에 전부 듣는 **브라우저 3D 심문 게임**(한국어·English).

- 거짓말할 때만 나오는 **버릇**(판마다 다름)을 저녁 메뉴 같은 뻔한 질문으로 먼저 익히고, 진짜 부인과 거짓 부인을 가려낸다.
- 팔을 머리 위로 묶은 자세라 **시간이 갈수록 어깨가 무너진다.** 줄을 당기면 압박이 세지지만 체력이 빨리 닳고, 늦추면 편해지지만 도망칠 수 있다.
- 폰을 직접 뒤져 증거를 챙기고, 들이밀어 특정 건을 친다. 소음이 커지면 이웃이 신고한다.
- 판결(용서·각서·이혼) 뒤 짧은 후일담과 답 맞추기(진상·버릇·점수·등급).
- 바람핀 쪽은 언제나 남편, 묻는 쪽(1인칭 주인공)은 언제나 아내.

> 이 이야기는 픽션이며 폭력을 권하지 않습니다. 점수는 **손을 대지 않을수록** 높습니다.

## 실행

```bash
npm run serve        # http://localhost:8765
npm test             # 규칙 시뮬레이션(결정성·대사 키·전략별 분포)
python3 tests/e2e.py # 헤드리스 크롬 통짜 검사(시작→행동→폰→증거→판결→결과, 콘솔 오류 0)
```

URL 옵션: `?lang=ko|en` `?seed=123`(같은 진상) `?fast`(10배속) `?step`(프레임 수동, 캡처용).

## 구조

| 파일 | 역할 |
|---|---|
| `web/js/game.js` | 규칙(화면 없음, Node에서도 돎). 자세한 규칙은 [SPEC.md](SPEC.md) |
| `web/js/main.js` | 3D·UI·연출 연결, 저장/이어하기(seed + 행동 목록) |
| `web/js/husband.js` | 묶인 사람: 머리 위로 묶은 자세 IK, 표정(ARKit 52)·버릇·립싱크·머리 스프링·피부 상태 |
| `web/js/arms.js`, `clips.js` | 1인칭 팔 IK와 행동별 동작 |
| `web/js/room.js`, `props.js` | 방·소품(전부 코드로 생성) |
| `web/js/post.js` | 화면 처리: GTAO·번짐·톤 매핑·필름 그레인·비네트. 화질 높음/가볍게/끄기(`?gfx=high|low|off`) |
| `web/js/audio.js` | 효과음·방 소리·배경음악(WebAudio로 생성, 파일 없음) |
| `web/js/i18n.js`, `web/data/*.json` | 한/영 문구와 대본 |
| `tools/build_human.py` | MakeHuman CC0 자산 → GLB(Blender 없이). 나이·근육 모프 포함. `build_models.sh` → `optimize.sh` |
| `tools/bake_hair.py` | 몸 UV 에 털·수염 가닥과 땀 구역을 코드로 그려 `body_hair.png` 를 굽는다(나이·긴장에 따라 런타임에서 세기 조절) |

모델 다시 만들기: `MPFB_DATA=… MH_ASSETS=… FACEUNITS=… tools/build_models.sh && tools/optimize.sh` (자산 위치는 CREDITS.md).

배포: main 에 푸시하면 GitHub Actions 가 `web/` 을 GitHub Pages 로 올린다 → https://club-paradiso.github.io/widowmaker/ (올리기 전에 `npm run bump`).
