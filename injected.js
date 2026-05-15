// 페이지 컨텍스트에서 실행됩니다. Leaflet, STATIONS, renderMap 모두 사용 가능합니다.

window.injectHomeFeature = window.injectHomeFeature || function noopKorailHomeFeature() {};

// L이 정의될 때까지 대기 (혹시 로드 타이밍 차이가 있을 경우 대비)
function waitForL(cb) {
  if (typeof L !== "undefined") { cb(); return; }
  setTimeout(() => waitForL(cb), 50);
}

waitForL(() => {

const HOME_PANEL_ID = "korail-nearest-station-panel";
const QUICK_MENU_TEXTS = [
  "승차권 예매",
  "승차권 확인",
  "예약승차권 조회/취소",
  "고객센터",
  "자주찾는 질문(FAQ)",
];

function cleanup() {
  // 열차 목록이 사라지면 지도 패널도 정리
  const wrapper = document.getElementById("korail-map-wrapper");
  if (wrapper) {
    // tckWrap을 wrapper 밖으로 복원 후 wrapper 제거
    const tckWrap = wrapper.querySelector(".tckWrap");
    if (tckWrap) wrapper.parentNode.insertBefore(tckWrap, wrapper);
    wrapper.remove();
  }
  const panel = document.getElementById("korail-map-panel");
  if (panel) panel.remove();
}

function cleanupHomeNearestPanel() {
  const panel = document.getElementById(HOME_PANEL_ID);
  if (panel) panel.remove();
}

function findHomeQuickMenu() {
  const normalize = (text) => text.replace(/\s+/g, "");
  const labels = QUICK_MENU_TEXTS.map(normalize);
  const textNodes = [...document.querySelectorAll("a, button, li, span, p, strong, em")];

  const matched = labels
    .map((label) => textNodes
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return false;
        if (rect.top < window.innerHeight * 0.22) return false;
        return normalize(el.textContent || "").includes(label);
      })
      .sort((a, b) => {
        const aLength = normalize(a.textContent || "").length;
        const bLength = normalize(b.textContent || "").length;
        return aLength - bLength;
      })[0])
    .filter(Boolean);

  if (matched.length < 3) return null;

  const rects = matched.map((el) => el.getBoundingClientRect());
  const paddingX = window.innerWidth * 0.012;
  const paddingY = window.innerHeight * 0.018;
  const left = Math.min(...rects.map((rect) => rect.left)) - paddingX;
  const top = Math.min(...rects.map((rect) => rect.top)) - paddingY;
  const right = Math.max(...rects.map((rect) => rect.right)) + paddingX;
  const bottom = Math.max(...rects.map((rect) => rect.bottom)) + paddingY;

  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function positionHomeNearestPanel(panel) {
  const rect = findHomeQuickMenu();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const gap = Math.max(5, viewportWidth * 0.009);//12,0.009
  const marginX = Math.max(5, viewportWidth * 0.005);//16,0.013
  const panelWidth = panel.offsetWidth || 320;
  const fallbackRect = {
    top: viewportHeight * 0.18,
    left: viewportWidth * 0.67,
    right: viewportWidth * 0.78,
  };
  const baseRect = rect || fallbackRect;
  const hasRightSpace = baseRect.right + gap + panelWidth <= viewportWidth - marginX;
  const desiredLeft = hasRightSpace
    ? baseRect.right + gap
    : baseRect.left - panelWidth - gap;
  const maxLeft = viewportWidth - panelWidth - marginX;
  const left = Math.min(Math.max(marginX, desiredLeft), maxLeft);
  const top = baseRect.top;

  panel.style.top = `${top + window.scrollY}px`;
  panel.style.left = `${left + window.scrollX}px`;
}

function getGoogleMapsApiKey() {
  return window.KORAIL_MAP_CONFIG?.googleMapsApiKey?.trim() || "";
}

function normalizeGoogleApiError(message) {
  if (message.includes("referer restrictions cannot be used")) {
    return "Google API 키의 애플리케이션 제한을 '없음'으로 바꾸거나, 서버 프록시에서 IP 제한 키를 사용해야 합니다.";
  }
  if (message.includes("API key not valid")) {
    return "Google API 키 값을 확인해 주세요.";
  }
  if (message.includes("REQUEST_DENIED")) {
    return "Google API 사용 설정과 API 키 제한을 확인해 주세요.";
  }
  return message;
}

function buildGoogleApiError(message) {
  const normalized = normalizeGoogleApiError(message);
  return normalized === message ? message : `${normalized}\n원문 오류: ${message}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function requestGoogleApi(kind, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `korail-map-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", handleResponse);
      reject(new Error("Google API 응답 시간이 초과되었습니다."));
    }, 12000);

    function handleResponse(event) {
      if (event.source !== window) return;
      const response = event.data;
      if (!response || response.type !== "KORAIL_MAP_API_RESPONSE" || response.requestId !== requestId) return;
      clearTimeout(timeoutId);
      window.removeEventListener("message", handleResponse);
      if (response.ok) {
        resolve(response.data);
      } else {
        reject(new Error(buildGoogleApiError(response.error || "Google API 요청에 실패했습니다.")));
      }
    }

    window.addEventListener("message", handleResponse);
    window.postMessage({
      type: "KORAIL_MAP_API_REQUEST",
      requestId,
      kind,
      ...payload,
    }, "*");
  });
}

function getMajorStations() {
  return Object.entries(STATIONS)
    .filter(([, coords]) => coords.major === true)
    .map(([name, coords]) => ({ name, lat: coords.lat, lng: coords.lng }));
}

function getDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours}시간 ${remain}분` : `${hours}시간`;
}

function renderNearestResults(panel, state, message, stations = []) {
  const result = panel.querySelector("[data-nearest-result]");
  if (!result) return;

  const stateLabel = {
    idle: "주소를 입력해 주세요",
    loading: "주요역을 찾는 중입니다",
    error: "조회할 수 없습니다",
    done: message,
  }[state] || message;
  const safeStateLabel = escapeHtml(stateLabel);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  if (state !== "done") {
    result.innerHTML = `
      <span class="korail-nearest-card__result-label">조회 결과</span>
      <strong>${safeStateLabel}</strong>
      <small>${safeMessage}</small>
    `;
    return;
  }

  result.innerHTML = `
    <span class="korail-nearest-card__result-label">TOP 3</span>
    <ol class="korail-nearest-list">
      ${stations.map((station, index) => `
        <li>
          <span class="korail-nearest-list__rank">${index + 1}</span>
          <span class="korail-nearest-list__name">${station.name}</span>
          <span class="korail-nearest-list__meta">
            ${station.durationText ? `${station.durationText} · ` : ""}${station.distanceText}
          </span>
        </li>
      `).join("")}
    </ol>
  `;
}

async function geocodeAddress(address) {
  const key = getGoogleMapsApiKey();
  if (!key) throw new Error("api-config.js에 Google Maps API 키를 입력해 주세요.");
  const data = await requestGoogleApi("geocode", { key, address });
  if (data.status !== "OK" || !data.results?.[0]) {
    const rawError = [data.status, data.error_message].filter(Boolean).join(" - ");
    throw new Error(buildGoogleApiError(rawError || "주소를 좌표로 변환하지 못했습니다."));
  }

  const location = data.results[0].geometry.location;
  return { lat: location.lat, lng: location.lng };
}

function getNearestByDistance(origin, limit = 3) {
  return getMajorStations()
    .map((station) => {
      const distanceMeters = getDistanceMeters(origin, station);
      return {
        ...station,
        distanceMeters,
        distanceText: formatDistance(distanceMeters),
      };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, limit);
}

async function getRouteInfo(origin, station) {
  const key = getGoogleMapsApiKey();
  const data = await requestGoogleApi("route", {
    key,
    body: {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: station.lat, longitude: station.lng } } },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      languageCode: "ko-KR",
      units: "METRIC",
    },
  });
  const route = data.routes?.[0];
  if (!route) {
    throw new Error(buildGoogleApiError(data.error?.message || "경로 계산에 실패했습니다."));
  }

  const durationSeconds = Number(String(route.duration || "0s").replace("s", ""));
  return {
    ...station,
    durationSeconds,
    durationText: formatDuration(durationSeconds),
    routeDistanceMeters: route.distanceMeters,
    distanceText: formatDistance(route.distanceMeters || station.distanceMeters),
  };
}

async function searchNearestStations(panel, mode) {
  const input = panel.querySelector("[data-nearest-address]");
  const address = input?.value.trim();
  if (!address) {
    renderNearestResults(panel, "error", "주소나 장소명을 입력해 주세요.");
    input?.focus();
    return;
  }

  try {
    renderNearestResults(panel, "loading", mode === "time" ? "이동 시간 기준으로 계산 중입니다." : "거리 기준으로 계산 중입니다.");
    const origin = await geocodeAddress(address);

    if (mode === "time") {
      const candidates = getNearestByDistance(origin, 8);
      const routes = await Promise.allSettled(candidates.map((station) => getRouteInfo(origin, station)));
      const stations = routes
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value)
        .sort((a, b) => a.durationSeconds - b.durationSeconds)
        .slice(0, 3);
      if (stations.length === 0) throw new Error("Routes API 결과가 없습니다. API 제한과 사용 설정을 확인해 주세요.");
      renderNearestResults(panel, "done", "시간순 가까운 주요역", stations);
      return;
    }

    renderNearestResults(panel, "done", "거리순 가까운 주요역", getNearestByDistance(origin, 3));
  } catch (error) {
    renderNearestResults(panel, "error", error.message || "조회 중 오류가 발생했습니다.");
  }
}

function bindHomeNearestPanel(panel) {
  const form = panel.querySelector("[data-nearest-form]");
  const setActiveMode = (mode) => {
    panel.querySelectorAll("[data-nearest-mode]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.nearestMode === mode);
    });
  };

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const activeMode = panel.querySelector("[data-nearest-mode].is-active")?.dataset.nearestMode || "distance";
    searchNearestStations(panel, activeMode);
  });

  panel.querySelectorAll("[data-nearest-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.nearestMode;
      setActiveMode(mode);
      searchNearestStations(panel, mode);
    });
  });
}

function injectHomeNearestPanel() {
  const existingPanel = document.getElementById(HOME_PANEL_ID);
  if (existingPanel) {
    positionHomeNearestPanel(existingPanel);
    return;
  }
  if (!document.querySelector("#labelstart") || !document.querySelector("#labelend")) return;
  if (document.querySelector(".tckWrap")) {
    cleanupHomeNearestPanel();
    return;
  }

  const panel = document.createElement("section");
  panel.id = HOME_PANEL_ID;
  panel.setAttribute("aria-label", "내 위치에서 가까운 주요역 찾기");
  panel.innerHTML = `
    <div class="korail-nearest-card">
      <div class="korail-nearest-card__head">
        <span class="korail-nearest-card__eyebrow">현재 위치 기반</span>
        <h2>가까운 주요역 찾기</h2>
        <p>주소를 입력하면 가까운 KTX 주요역 TOP 3를 찾아줍니다.</p>
      </div>
      <form class="korail-nearest-search" data-nearest-form>
        <label class="korail-nearest-search__label" for="korail-nearest-address">출발 위치</label>
        <div class="korail-nearest-search__row">
          <input id="korail-nearest-address" data-nearest-address type="text" placeholder="예: 서울시청, 대구 수성구" autocomplete="street-address">
          <button type="submit" class="korail-nearest-card__button">검색</button>
        </div>
      </form>
      <div class="korail-nearest-tabs" aria-label="정렬 기준">
        <button type="button" class="is-active" data-nearest-mode="distance">거리순</button>
        <button type="button" data-nearest-mode="time">시간순</button>
      </div>
      <div class="korail-nearest-card__result" data-nearest-result aria-live="polite">
        <span class="korail-nearest-card__result-label">조회 결과</span>
        <strong>주소 입력 후 검색</strong>
        <small>거리순은 Geocoding API, 시간순은 Routes API를 사용합니다.</small>
      </div>
      <div class="korail-nearest-card__chips" aria-label="주요역 예시">
        <span>서울</span>
        <span>대전</span>
        <span>동대구</span>
        <span>부산</span>
      </div>
    </div>
  `;

  document.body.appendChild(panel);
  bindHomeNearestPanel(panel);
  positionHomeNearestPanel(panel);
}

window.injectHomeFeature = injectHomeNearestPanel;

function tryInit() {
  const depEl = document.querySelector("#labelstart");
  const arrEl = document.querySelector("#labelend");

  // tckWrap 없으면 패널 정리 후 종료
  if (!document.querySelector(".tckWrap")) {
    cleanup();
    injectHomeNearestPanel();
    return;
  }

  cleanupHomeNearestPanel();

  if (!depEl || !arrEl) return;

  const dep = depEl.value.trim();
  const arr = arrEl.value.trim();

  if (!dep || !arr) return;
  if (document.getElementById("korail-map-panel")) return;
  if (!document.querySelector(".tckWrap")) return;

  const result = findRoute(dep, arr);

  let routeStations, fullRoute;
  if (result) {
    const { route, depIdx, arrIdx } = result;
    const [from, to] = depIdx < arrIdx ? [depIdx, arrIdx] : [arrIdx, depIdx];
    fullRoute = route.stations;
    routeStations = route.stations.slice(from, to + 1).map((name) => ({ name, ...STATIONS[name] }));
    if (depIdx > arrIdx) routeStations = [...routeStations].reverse();
  } else {
    fullRoute = [dep, arr];
    routeStations = [dep, arr].filter((n) => STATIONS[n]).map((name) => ({ name, ...STATIONS[name] }));
  }

  if (routeStations.length > 0) {
    injectMapPanel(dep, arr, routeStations, fullRoute);
  }
}

const spaObserver = new MutationObserver(() => tryInit());
spaObserver.observe(document.body, { childList: true, subtree: true });
window.addEventListener("resize", () => {
  const panel = document.getElementById(HOME_PANEL_ID);
  if (panel) positionHomeNearestPanel(panel);
});
tryInit();

// 팝업 감지는 항상 실행 (메인 페이지에서도 작동)
observeStationPopup();

function injectMapPanel(dep, arr, stations, fullRoute) {
  const trainTable = document.querySelector(".tckWrap");
  if (!trainTable) return;
  if (document.getElementById("korail-map-panel")) return;
  if (!stations.some((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))) return;

  const wrapper = document.createElement("div");
  wrapper.id = "korail-map-wrapper";
  trainTable.parentNode.insertBefore(wrapper, trainTable);
  wrapper.appendChild(trainTable);

  const panel = document.createElement("div");
  panel.id = "korail-map-panel";
  wrapper.appendChild(panel);

  renderMap(panel, dep, arr, stations, fullRoute);
}

function observeStationPopup() {
  const observer = new MutationObserver(() => {
    const popup = document.querySelector(".layerWrap.type_tranin-station-pop_wrap");
    const existing = document.getElementById("korail-station-map-popup");

    if (popup && !existing) {
      showStationMapPopup(popup);
    } else if (!popup && existing) {
      existing.remove();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function showStationMapPopup(popup) {
  const mapPopup = document.createElement("div");
  mapPopup.id = "korail-station-map-popup";
  document.body.appendChild(mapPopup);

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const mapWidth = Math.floor(vw * 0.28);
  const gap = Math.floor(vw * 0.008);
  const popupWidth = popup.offsetWidth;
  const totalWidth = popupWidth + gap + mapWidth;
  const startX = Math.max(8, Math.floor((vw - totalWidth) / 2));

  // 팝업 fixed 위치 조정
  popup.style.position = "fixed";
  popup.style.left = startX + "px";
  popup.style.right = "auto";
  popup.style.transform = "none";
  popup.style.marginLeft = "0";
  popup.style.top = "40px";
  popup.style.maxHeight = (vh - 60) + "px";
  popup.style.overflowY = "auto";

  const currentDep = document.querySelector("#labelstart")?.value.trim() || "";
  const currentArr = document.querySelector("#labelend")?.value.trim() || "";

  // 크기 설정 완료 후 지도 초기화
  setTimeout(() => {
    const popupRect = popup.getBoundingClientRect();
    const mapHeight = popupRect.height;

    mapPopup.style.position = "fixed";
    mapPopup.style.top = popupRect.top + "px";
    mapPopup.style.left = (popupRect.right + gap) + "px";
    mapPopup.style.width = mapWidth + "px";
    mapPopup.style.height = mapHeight + "px";

    // 크기가 잡힌 다음 렌더링
    renderStationMap(mapPopup, popup, currentDep, currentArr);
  }, 50);
}

}); // waitForL
