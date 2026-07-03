// content.js는 페이지 컨텍스트에 나머지 스크립트를 순서대로 주입하는 역할만 합니다.

const FILES = ["leaflet.js", "station-data.js", "map-panel.js", "api-config.js", "injected-core.js", "home-panel.js", "station-popup.js", "booking-map.js"];

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const request = event.data;
  if (!request || request.type !== "KORAIL_MAP_API_REQUEST") return;

  try {
    const response = await sendToBackground(request);

    window.postMessage({
      type: "KORAIL_MAP_API_RESPONSE",
      requestId: request.requestId,
      ok: response?.ok === true,
      data: response?.data,
      error: response?.error,
    }, "*");
  } catch (error) {
    window.postMessage({
      type: "KORAIL_MAP_API_RESPONSE",
      requestId: request.requestId,
      ok: false,
      error: error.message || "API request failed.",
    }, "*");
  }
});

function sendToBackground(request) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(request, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(`Background message failed: ${lastError.message}`));
        return;
      }
      if (!response) {
        reject(new Error("Background returned no response."));
        return;
      }
      resolve(response);
    });
  });
}

function injectNext(index) {
  if (index >= FILES.length) return;
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL(FILES[index]);
  script.onload = () => injectNext(index + 1);
  document.head.appendChild(script);
}

injectNext(0);
