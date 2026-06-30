# CLAUDE.md

Sponge Clock — 발표용 타이머. **Chrome 확장**과 **독립 웹앱/PWA** 양쪽에서 동일하게 동작한다.

## 빌드/실행 없음 (정적 자산)
- 빌드 스텝·패키지 매니저 없음. 순수 HTML/CSS/JS.
- **확장으로 실행**: `chrome://extensions` → 개발자 모드 → "압축해제된 확장 로드" → 이 폴더. 코드 수정 후엔 확장 카드의 새로고침(↻).
- **웹으로 실행/미리보기**: 정적 서버로 띄운다. 예) `python -m http.server 5599` 후 `http://localhost:5599/timer.html`. `index.html`은 `timer.html`로 리다이렉트.
- **로컬 테스트 주의**: `sw.js`(PWA 서비스워커)가 자산을 cache-first로 캐시한다. 새 코드가 안 보이면 서비스워커 unregister + 캐시 삭제 후 하드 리로드, 또는 `sw.js`의 `CACHE` 버전(`sponge-clock-vN`)을 올린다.

## 아키텍처 (핵심)
- **단일 상태 소스 = `engine.js`(전역 `SC`)**. 모든 표시 화면(팝업/미니/전체화면)이 이 상태를 공유한다.
  - 저장소 자동 전환: 확장이면 `chrome.storage.local`, 웹이면 `localStorage`(+`BroadcastChannel`로 탭 간 동기화). `SC.isExtension`로 분기.
  - **타임스탬프 기반**: 남은 시간을 매 틱 재계산(`endAt - now` 등)하므로 모든 창이 정확히 동기화되고, 백그라운드 rAF throttling에도 안전(인터벌 보정 틱 존재).
  - 모드: `countdown` / `stopwatch` / `agenda`(다구간) / 종료시각(=countdown으로 환산). 어젠다는 **경과 시간으로 현재 구간을 순수 계산**(`computed()`)해 경쟁 상태가 없다.
  - 변경은 반드시 `SC.*` 뮤테이터(`start/pause/reset/setDuration/setAgenda/setTarget/setSound/setVoice/setTheme/...`)를 통해서만. 직접 storage 쓰기 금지.
- **`background.js`(서비스워커, 확장 전용)**: 창/탭 열기, `chrome.alarms`로 종료 알림 예약, 시작 시 미니창 자동 실행.
- 표시 화면은 각자 rAF 루프에서 `SC.computed(state)`를 읽어 렌더하고, `SC.onChange`로 상호 동기화.

## 파일 맵
- `engine.js` — 상태 머신/저장소 어댑터/계산(`computed`)/존 색상(`ZONES`,`ACCENTS`).
- `popup.*` — 툴바 팝업(빠른 조작 + 미니/전체화면/새탭 실행).
- `mini.*` — 미니 플로팅 창 + 항상-위(Document Picture-in-Picture).
- `timer.*` — 전체화면/새탭 발표 화면 + 설정·어젠다·종료시각 대화상자.
- `sound.js`/`voice.js`/`cues.js` — 비프 사운드 / 음성 안내(TTS) / 큐 스케줄러(보이는 창에서만 1회 발화).
- `sw.js`,`manifest.webmanifest` — PWA(오프라인·설치). `manifest.json` — 확장 매니페스트(MV3).
- `icons/` — 16/48/128(확장) + 192/512(PWA). PNG는 `node`로 생성됨.

## 컨벤션
- 의존성 추가 지양(순수 웹). 새 표시 화면도 `engine.js`를 통해 상태를 읽고 쓴다.
- 사운드/음성 큐는 `cues.js`에 모은다(중복 발화 방지: `document.visibilityState==='visible'`인 창만 울림).
- 존 색상은 의미 고정: 경고=앰버, 위험=레드. 강조색(accent)은 calm 구간만 바꾼다.

## 함정/메모
- PWA 캐시 stale 문제(위 "로컬 테스트 주의").
- Document PiP·Wake Lock은 최신 Chromium + `https`/`localhost`에서 가장 잘 동작. `file://`은 타이머 자체만 동작.
- 배포: GitHub `hyun-arch/sponge-clock` → GitHub Pages **https://hyun-arch.github.io/sponge-clock/** (main 브랜치 루트). `.gitignore`로 `*.pptx/*.docx/*.pdf`·`.claude/` 제외. 코드 변경 후 `git push`하면 1분 내 Pages 자동 재배포(필요 시 `sw.js` `CACHE` 버전업).
