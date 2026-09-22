// Background-only client for the maps proxy.

((scope) => {
  async function request(request) {
    const configuredUrl = scope.KORAIL_BACKGROUND_CONFIG?.naverProxyUrl?.trim() || "";
    if (!configuredUrl) throw new Error("Maps proxy URL is not configured.");

    const proxyUrl = new URL(configuredUrl);
    if (proxyUrl.protocol !== "https:") throw new Error("Maps proxy must use HTTPS.");
    if (!["geocode", "driving", "transit", "locationGeocode", "locationReverse"].includes(request.kind)) {
      throw new Error("Unknown API request.");
    }

    if (request.kind === "locationGeocode" || request.kind === "locationReverse") {
      const path = request.kind === "locationGeocode" ? "/v1/geocode" : "/v1/reverse-geocode";
      const payload = request.kind === "locationGeocode"
        ? { kind: request.kind, address: request.address }
        : {
          kind: request.kind,
          lat: request.lat,
          lng: request.lng,
          language: request.language,
        };
      return requestProxy(new URL(path, proxyUrl.origin).href, payload);
    }

    if (request.kind === "transit") {
      return requestProxy(new URL("/v1/transit", proxyUrl.origin).href, {
        kind: request.kind,
        startLat: request.startLat,
        startLng: request.startLng,
        goalLat: request.goalLat,
        goalLng: request.goalLng,
      });
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

  scope.KORAIL_MAPS_CLIENT = { request };
})(self);
