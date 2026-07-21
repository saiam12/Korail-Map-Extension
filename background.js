importScripts("background-config.js");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !isKorailSender(sender)) return false;

  if (request.type === "KORAIL_SUPPORT_SUBMIT") {
    handleSupportSubmit(request, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message || "Feedback submission failed." }));
    return true;
  }

  if (request.type !== "KORAIL_MAP_API_REQUEST") return false;

  handleNaverApiRequest(request)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({
      ok: false,
      error: `Background fetch failed: ${error.message || "API request failed."}`,
      status: error.status,
    }));
  return true;
});

function isKorailSender(sender) {
  return /^https:\/\/(www\.)?korail\.com\//.test(sender.tab?.url || sender.url || "");
}

async function handleSupportSubmit(request, sender) {
  const endpoint = new URL(self.KORAIL_BACKGROUND_CONFIG?.supportFeedbackEndpoint || "");
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "formspree.io") {
    throw new Error("Invalid feedback endpoint.");
  }

  const payload = request.payload || {};
  const response = await fetch(endpoint.href, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      category: payload.category,
      message: payload.message,
      contact: payload.contact,
      pageUrl: sender.tab?.url || sender.url || "",
      locale: typeof payload.locale === "string" ? payload.locale.slice(0, 20) : "unknown",
    }),
  });
  if (!response.ok) throw new Error(`Feedback submission failed: ${response.status}`);
}

async function handleNaverApiRequest(request) {
  const configuredUrl = self.KORAIL_BACKGROUND_CONFIG?.naverProxyUrl?.trim() || "";
  if (!configuredUrl) throw new Error("Naver Maps proxy URL is not configured.");

  const proxyUrl = new URL(configuredUrl);
  if (proxyUrl.protocol !== "https:") throw new Error("Naver Maps proxy must use HTTPS.");
  if (!["geocode", "driving", "locationGeocode", "locationReverse"].includes(request.kind)) throw new Error("Unknown API request.");

  if (request.kind === "locationGeocode" || request.kind === "locationReverse") {
    const path = request.kind === "locationGeocode" ? "/v1/geocode" : "/v1/reverse-geocode";
    const payload = request.kind === "locationGeocode"
      ? { kind: request.kind, address: request.address }
      : { kind: request.kind, lat: request.lat, lng: request.lng };
    return requestProxy(new URL(path, proxyUrl.origin).href, payload);
  }

  const payload = request.kind === "geocode"
    ? { kind: request.kind, address: request.address }
    : {
      kind: request.kind,
      startLat: request.startLat,
      startLng: request.startLng,
      goalLat: request.goalLat,
      goalLng: request.goalLng,
    };
  return requestProxy(proxyUrl.href, payload);
}

async function requestProxy(url, payload) {
  const installationId = await getInstallationId().catch(() => "");
  const response = await requestMapsProxy(url, installationId ? { ...payload, installationId } : payload);
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    const error = new Error(data?.message || data?.error || `Maps proxy HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function requestMapsProxy(url, payload) {
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "X-Korail-Extension-Id": chrome.runtime.id,
  };
  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

async function getInstallationId() {
  const storageKey = "korail-installation-id";
  const stored = await chrome.storage.local.get(storageKey);
  if (/^[0-9a-f-]{36}$/i.test(stored[storageKey] || "")) return stored[storageKey];
  const installationId = crypto.randomUUID();
  await chrome.storage.local.set({ [storageKey]: installationId });
  return installationId;
}
