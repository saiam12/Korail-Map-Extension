# Korail Route Map

코레일 웹사이트에 노선 지도와 열차 정차역 정보를 추가하는 Chrome 확장 프로그램입니다.

[Chrome 웹 스토어에서 설치](https://chromewebstore.google.com/detail/nhkgggbfamgagjelnjhhbikkddbjefel) · [최신 릴리스](https://github.com/saiam12/Korail-Map-Extension/releases/latest) · [문제 제보](https://github.com/saiam12/Korail-Map-Extension/issues)

## 주요 기능

- 승차권 검색 결과에서 선택한 열차의 운행 구간과 정차역 표시
- 환승 여정의 선행·후행 열차 구간과 환승역 표시
- 열차시각을 기준으로 실제 정차역 갱신
- 역 선택 화면에서 전국 역 위치 확인
- 현재 위치나 주소를 기준으로 가까운 역 검색
- 한국어·글로벌 코레일 페이지 지원

## 설치

### Chrome 웹 스토어

[Chrome 웹 스토어](https://chromewebstore.google.com/detail/nhkgggbfamgagjelnjhhbikkddbjefel)에서 **Chrome에 추가**를 선택합니다.

### GitHub 릴리스

1. [최신 릴리스](https://github.com/saiam12/Korail-Map-Extension/releases/latest)에서 ZIP 파일을 내려받아 압축을 풉니다.
2. Chrome에서 `chrome://extensions`를 엽니다.
3. **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다**를 선택합니다.
5. 압축을 푼 폴더를 선택합니다.

## 사용 방법

1. [코레일 승차권 예매](https://www.korail.com/ticket/main)에서 출발역과 도착역을 검색합니다.
2. 검색 결과에서 이용할 열차나 환승 열차의 좌석을 선택합니다.
3. 검색 결과 아래에 선택 구간의 노선 지도와 정차역이 표시됩니다.
4. **열차시각**을 열면 해당 열차의 실제 정차역 정보가 지도에 반영됩니다.
5. 역 선택 화면에서는 지도에서 역 위치를 확인하거나 현재 위치·주소로 가까운 역을 찾을 수 있습니다.

지도에서 선택한 이동 구간은 진한 파란색, 전체 운행 정보는 회색으로 표시됩니다. 출발역과 도착역은 이름표로 구분됩니다.

## 권한과 개인정보

- 위치 권한은 사용자가 **현재 위치** 기능을 실행할 때만 사용합니다.
- 주소·장소 검색 기록과 경로 결과는 기기에 최대 24시간 저장됩니다.
- 배경 지도는 CARTO에서, 주소·경로 검색은 Cloudflare Worker를 통해 Naver/Kakao API에서 제공합니다.
- 정보는 판매하거나 광고 프로파일링에 사용하지 않습니다.

자세한 내용은 [개인정보처리방침](PRIVACY_POLICY.md)을 확인하세요.

## 문제 해결

- 지도가 보이지 않으면 코레일 페이지를 완전히 새로고침합니다.
- 확장 프로그램을 업데이트한 뒤 이미 열려 있던 코레일 탭은 반드시 다시 불러옵니다.
- 현재 위치를 사용할 수 없으면 Chrome의 위치 권한을 확인합니다.
- 문제가 계속되면 [GitHub Issues](https://github.com/saiam12/Korail-Map-Extension/issues)에 코레일 페이지 주소, 재현 단계, 화면을 남겨 주세요. API 키나 개인정보는 첨부하지 마세요.

## 프로젝트 구성

```text
코레일 페이지
  ├─ 확장 프로그램 ──> CARTO 배경 지도
  └─ 백그라운드 ──> Cloudflare Worker ──> Naver/Kakao API
```

- `src/page/`: 노선 지도, 예매 결과, 역 선택 화면
- `src/background/`: 백그라운드 처리와 Worker 통신
- `src/shared/`: 페이지와 백그라운드 사이의 메시지 규약
- `src/data/`: 역 좌표, 노선, 번역 데이터
- `assets/`: 스타일, 아이콘, Leaflet
- `proxy-worker/`: 외부 지도 API 비밀키를 보호하는 Cloudflare Worker
- `tests/`: 페이지 모듈과 Worker 회귀 테스트

## 개발 및 패키징

테스트:

```powershell
node --test tests/page-modules.test.mjs proxy-worker/src/index.test.mjs
```

Chrome 웹 스토어용 ZIP 생성:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\package-extension.ps1
```

Worker 설정과 배포 방법은 [proxy-worker/README.md](proxy-worker/README.md)를 확인하세요.
