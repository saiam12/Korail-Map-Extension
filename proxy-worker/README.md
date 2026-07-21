# Korail Map Naver API Proxy

이 Worker는 Chrome 확장 프로그램에 Naver Maps Client Secret을 포함하지 않기 위한 프록시입니다.

## 1. 기존 키 폐기

Naver Cloud 콘솔에서 확장 프로그램 코드에 들어갔던 Client Secret을 재발급합니다. 이전 값은 다시 사용하지 않습니다.

## 2. Worker 설정

```powershell
Copy-Item .\wrangler.toml.example .\wrangler.toml
npx wrangler login
npx wrangler secret put NAVER_CLIENT_ID
npx wrangler secret put NAVER_CLIENT_SECRET
```

`wrangler.toml`의 `ALLOWED_EXTENSION_IDS`를 Chrome 웹스토어에서 할당받은 확장 프로그램 ID로 변경합니다. 여러 ID는 쉼표로 구분할 수 있습니다.

## 3. 배포

```powershell
npx wrangler deploy
```

배포 결과가 `https://korail-map-proxy.<account>.workers.dev`라면 확장 프로그램의 `background-config.js`를 다음처럼 설정합니다.

```js
self.KORAIL_BACKGROUND_CONFIG = {
  naverProxyUrl: "https://korail-map-proxy.<account>.workers.dev/v1/maps"
};
```

`manifest.json`의 `https://*.workers.dev/*` 권한도 최종 Worker 호스트 하나로 좁히는 것을 권장합니다.

## 4. 출시 전 보호 설정

- Naver Cloud Maps의 일일·월간 호출 한도와 사용량 알림을 설정합니다.
- `wrangler.toml.example`의 `MAPS_RATE_LIMITER` 바인딩을 실제 `wrangler.toml`에도 추가합니다. 설치별 실제 API 요청은 분당 40회로 제한됩니다.
- `namespace_id`는 Cloudflare 계정 안에서 이 제한에만 사용하는 양의 정수 문자열로 지정합니다.
- Worker 로그에 Client ID 또는 Client Secret을 출력하지 않습니다.
- `wrangler.toml`과 `.dev.vars`에 실제 비밀키를 기록하지 않습니다.

확장 프로그램 ID 검사는 무단 브라우저 호출을 줄여주지만 완전한 인증 수단은 아닙니다. 공개 클라이언트는 복제될 수 있으므로 서버 측 호출 제한과 Naver 사용량 한도를 함께 설정해야 합니다.
