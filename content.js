// content.js는 페이지 컨텍스트에 나머지 스크립트를 순서대로 주입하는 역할만 합니다.

const FILES = ["leaflet.js", "station-data.js", "station-translations.js", "map-panel.js", "injected-core.js", "support-widget.js", "home-panel.js", "station-popup.js", "booking-map.js"];
const INJECTED_RESOURCE_VERSION = "20260723-2102";

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const request = event.data;
  if (!request || typeof request.requestId !== "string" || request.requestId.length > 100) return;

  if (request.type === "KORAIL_CURRENT_LOCATION_REQUEST") {
    requestCurrentLocation(request.requestId);
    return;
  }

  if (request.type === "KORAIL_NEAREST_CACHE_REQUEST") {
    handleNearestCache(request);
    return;
  }

  if (request.type === "KORAIL_SUPPORT_SUBMIT") {
    if (!isValidPageRequest(request)) return;
    try {
      const result = await submitSupportFeedback(request.payload);
      window.postMessage({ type: "KORAIL_SUPPORT_RESPONSE", requestId: request.requestId, ok: true, result }, "*");
    } catch (error) {
      window.postMessage({ type: "KORAIL_SUPPORT_RESPONSE", requestId: request.requestId, ok: false, error: error.message || "Feedback submission failed." }, "*");
    }
    return;
  }

  if (request.type !== "KORAIL_MAP_API_REQUEST") return;
  if (!isValidPageRequest(request)) return;

  try {
    const response = await sendToBackground(request);

    window.postMessage({
      type: "KORAIL_MAP_API_RESPONSE",
      requestId: request.requestId,
      ok: response?.ok === true,
      data: response?.data,
      error: response?.error,
      status: response?.status,
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

async function submitSupportFeedback(payload) {
  const response = await sendToBackground({
    type: "KORAIL_SUPPORT_SUBMIT",
    payload,
  });
  if (response?.ok !== true || response?.data?.accepted !== true) {
    throw new Error(response?.error || "Feedback submission failed.");
  }
  return response.data;
}

function isValidPageRequest(request) {
  if (request.type === "KORAIL_SUPPORT_SUBMIT") {
    const payload = request.payload;
    return payload && typeof payload === "object"
      && ["bug", "suggestion", "other"].includes(payload.category)
      && typeof payload.message === "string" && payload.message.length <= 4000
      && typeof payload.contact === "string" && payload.contact.length <= 200;
  }
  if (request.type !== "KORAIL_MAP_API_REQUEST") return false;
  if (request.kind === "geocode" || request.kind === "locationGeocode") {
    return typeof request.address === "string" && request.address.length <= 200;
  }
  if (request.kind === "driving") {
    return [request.startLat, request.startLng, request.goalLat, request.goalLng].every(Number.isFinite);
  }
  if (request.kind === "trainSchedule") {
    return /^\d{8}$/.test(request.runDate || "")
      && /^\d{1,6}$/.test(request.trainNo || "")
      && /^\d{0,6}$/.test(request.trainGroupCode || "");
  }
  return request.kind === "locationReverse" && Number.isFinite(request.lat) && Number.isFinite(request.lng);
}

const nearestCacheStorageKey = "korail-nearest-search-cache-v1";
const nearestCacheMaxEntries = 100;
const nearestCacheTtlMs = 7 * 24 * 60 * 60 * 1000;
let nearestCacheWriteQueue = Promise.resolve();

function handleNearestCache(request) {
  nearestCacheWriteQueue = nearestCacheWriteQueue
    .catch(() => {})
    .then(() => processNearestCache(request))
    .catch((error) => {
      window.postMessage({
        type: "KORAIL_NEAREST_CACHE_RESPONSE",
        requestId: request.requestId,
        ok: false,
        error: error.message || "Nearest cache failed.",
      }, "*");
    });
}

async function processNearestCache(request) {
    if (request.action === "clear") {
      await chrome.storage.local.remove(nearestCacheStorageKey);
      respondNearestCache(request, null);
      return;
    }

    const stored = await chrome.storage.local.get(nearestCacheStorageKey);
    const cache = stored[nearestCacheStorageKey] || {};
    if (request.action === "get") {
      const entry = cache[request.key];
      const isFresh = entry && Number.isFinite(entry.savedAt)
        && Date.now() - entry.savedAt <= nearestCacheTtlMs
        && Array.isArray(entry.results);
      respondNearestCache(request, isFresh ? entry : null);
      return;
    }

    if (request.action === "list") {
      const entries = Object.entries(cache)
        .filter(([, entry]) => Number.isFinite(entry?.savedAt)
          && Date.now() - entry.savedAt <= nearestCacheTtlMs
          && Array.isArray(entry.results)
          && entry.hiddenFromHistory !== true)
        .sort(([, a], [, b]) => b.savedAt - a.savedAt)
        .slice(0, nearestCacheMaxEntries)
        .map(([key, entry]) => ({
          key,
          savedAt: entry.savedAt,
          address: typeof entry.address === "string"
            ? entry.address
            : key.slice(key.indexOf(":") + 1),
          includeAllStations: typeof entry.includeAllStations === "boolean"
            ? entry.includeAllStations
            : key.startsWith("all:"),
        }));
      respondNearestCache(request, entries);
      return;
    }

    if (request.action === "hide" && typeof request.key === "string") {
      const entry = cache[request.key];
      if (entry && Array.isArray(entry.results)) {
        cache[request.key] = { ...entry, hiddenFromHistory: true };
        await chrome.storage.local.set({ [nearestCacheStorageKey]: cache });
      }
      respondNearestCache(request, null);
      return;
    }

    if (request.action === "set"
      && typeof request.key === "string"
      && request.key.length <= 300
      && Array.isArray(request.entry?.results)
      && request.entry.results.length <= 8) {
      const freshEntries = Object.entries(cache)
        .filter(([key, entry]) => key !== request.key
          && Number.isFinite(entry?.savedAt)
          && Date.now() - entry.savedAt <= nearestCacheTtlMs)
        .sort(([, a], [, b]) => b.savedAt - a.savedAt)
        .slice(0, nearestCacheMaxEntries - 1);
      const nextCache = Object.fromEntries(freshEntries);
      nextCache[request.key] = request.entry;
      await chrome.storage.local.set({ [nearestCacheStorageKey]: nextCache });
      respondNearestCache(request, request.entry);
      return;
    }
    throw new Error("Invalid nearest cache request.");
}

function respondNearestCache(request, entry) {
  window.postMessage({
    type: "KORAIL_NEAREST_CACHE_RESPONSE",
    requestId: request.requestId,
    ok: true,
    entry,
  }, "*");
}

function requestCurrentLocation(requestId) {
  if (!navigator.geolocation) {
    window.postMessage({ type: "KORAIL_CURRENT_LOCATION_RESPONSE", requestId, ok: false, error: "Geolocation is unavailable." }, "*");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => window.postMessage({
      type: "KORAIL_CURRENT_LOCATION_RESPONSE",
      requestId,
      ok: true,
      data: { lat: position.coords.latitude, lng: position.coords.longitude },
    }, "*"),
    () => window.postMessage({ type: "KORAIL_CURRENT_LOCATION_RESPONSE", requestId, ok: false, error: "Location permission was denied." }, "*"),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  );
}

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
  script.src = `${chrome.runtime.getURL(FILES[index])}?v=${INJECTED_RESOURCE_VERSION}`;
  script.onload = () => injectNext(index + 1);
  document.head.appendChild(script);
}

injectNext(0);
