// 페이지 컨텍스트에서 실행됩니다. Leaflet, STATIONS, renderMap 모두 사용 가능합니다.

window.injectHomeFeature = window.injectHomeFeature || function noopKorailHomeFeature() {};

// L이 정의될 때까지 대기 (혹시 로드 타이밍 차이가 있을 경우 대비)
function waitForL(cb) {
  if (typeof L !== "undefined") { cb(); return; }
  setTimeout(() => waitForL(cb), 50);
}

waitForL(() => {
  console.log("[Korail] waitForL fired");
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
  document.getElementById("korail-nearest-mini-btn")?.remove();
  document.getElementById("korail-intro-toggle-btn")?.remove();
  setHomeSidePanelShift(false);
}

function isLoginPage() {
  const path = location.pathname.toLowerCase();
  if (path.includes("login")) return true;
  return !!document.querySelector('input[type="password"]')
    && [...document.querySelectorAll("button, a, input")]
      .some((el) => ((el.textContent || el.value || "").trim() === "로그인"));
}

function isBookingOptionPopupOpen() {
  const hasDimLayer = [...document.querySelectorAll("div")]
    .some((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.8 || rect.height < window.innerHeight * 0.8) return false;
      if (rect.left > 4 || rect.top > 4) return false;

      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (style.position !== "fixed" && style.position !== "absolute") return false;
      return style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
    });
  if (!hasDimLayer) return false;

  const titleEls = [...document.querySelectorAll("div, section, article, h1, h2, h3, strong, p, span")]
    .filter((el) => {
      const text = (el.textContent || "").trim();
      if (text !== "날짜 선택" && text !== "인원 선택") return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

  return titleEls.some((titleEl) => {
    let modal = titleEl;
    for (let depth = 0; modal && depth < 6; depth += 1, modal = modal.parentElement) {
      const rect = modal.getBoundingClientRect();
      if (rect.width < 320 || rect.height < 260) continue;
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= window.innerHeight || rect.left >= window.innerWidth) continue;

      const hasCloseButton = [...modal.querySelectorAll("button, a, [role='button']")]
        .some((btn) => {
          const label = (btn.textContent || btn.getAttribute("aria-label") || "").trim();
          if (["×", "✕", "닫기"].includes(label)) return true;

          const btnRect = btn.getBoundingClientRect();
          return btnRect.width >= 16
            && btnRect.height >= 16
            && btnRect.left >= rect.right - 96
            && btnRect.top <= rect.top + 96;
        });
      if (hasCloseButton) return true;
    }
    return false;
  });
}

function updateNearestDisabledState() {
  const disabled = isBookingOptionPopupOpen();
  [
    document.getElementById(HOME_PANEL_ID),
    document.getElementById("korail-nearest-mini-btn"),
    document.getElementById("korail-intro-toggle-btn"),
  ].forEach((el) => {
    if (el) el.classList.toggle("is-korail-muted", disabled);
  });
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
let homePanelMiniOpen = false;
function getHomeSidePanel() {
  return document.querySelector("div.ticket_box");
}

function getHomeSidePanelItems() {
  const sidePanel = getHomeSidePanel();
  if (!sidePanel) return [];

  const items = [sidePanel];
  const prev = sidePanel.previousElementSibling;
  if (prev) {
    const sideRect = sidePanel.getBoundingClientRect();
    const prevRect = prev.getBoundingClientRect();
    if (prevRect.width > 0 && prevRect.height > 0 && Math.abs(prevRect.left - sideRect.left) < 24) {
      items.push(prev);
    }
  }
  return items;
}

function setHomeSidePanelShift(offset = 0) {
  getHomeSidePanelItems().forEach((el) => {
    el.style.transform = offset > 0 ? `translateX(${offset}px)` : "";
    el.style.transition = offset > 0 ? "transform 0.18s ease" : "";
  });
}

function getCompactHomeLayout() {
  const banner = document.querySelector(".pop_slide")?.closest("div");
  const sidePanel = getHomeSidePanel();
  const sideItems = getHomeSidePanelItems();
  const previousTransforms = sideItems.map((el) => el.style.transform);
  sideItems.forEach((el) => { el.style.transform = ""; });

  const bannerRect = banner?.getBoundingClientRect();
  const sideRect = sidePanel?.getBoundingClientRect();
  if (window.innerWidth > 640 || !bannerRect || !sideRect) {
    sideItems.forEach((el, index) => { el.style.transform = previousTransforms[index]; });
    return null;
  }

  const marginX = 14;
  const gap = 12;
  const panelWidth = Math.min(210, Math.max(180, window.innerWidth * 0.44));
  const desiredSideLeft = marginX + panelWidth + gap;
  const shift = Math.max(0, desiredSideLeft - sideRect.left);

  sideItems.forEach((el, index) => { el.style.transform = previousTransforms[index]; });
  return { marginX, panelWidth, shift };
}

function positionCompactHomePanel(panel) {
  const sidePanel = getHomeSidePanel();
  const layout = getCompactHomeLayout();
  if (!sidePanel || !layout) return false;

  setHomeSidePanelShift(layout.shift);
  const shiftedRects = getHomeSidePanelItems().map((el) => el.getBoundingClientRect());
  const shiftedSideTop = Math.min(...shiftedRects.map((rect) => rect.top));

  panel.style.display = "";
  panel.style.position = "absolute";
  panel.style.top = `${shiftedSideTop + window.scrollY}px`;
  panel.style.left = `${layout.marginX + window.scrollX}px`;
  panel.style.width = `${layout.panelWidth}px`;
  panel.style.zIndex = "9999";
  panel.style.height = "";
  return true;
}

function positionHomeNearestPanel(panel) {
  if (location.pathname.includes("/intro")) return;
  const rect = findHomeQuickMenu();
  const viewportWidth = window.innerWidth;
  const gap = Math.max(5, viewportWidth * 0.009);
  const marginX = Math.max(5, viewportWidth * 0.005);
  const panelWidth = panel.offsetWidth || 320;
  const fallbackRect = {
    top: viewportWidth * 0.18,
    left: viewportWidth * 0.67,
    right: viewportWidth * 0.78,
    bottom: viewportWidth * 0.42,
  };
  const baseRect = rect || fallbackRect;

  const banner = document.querySelector(".pop_slide")?.closest("div");
  const bannerRect = banner?.getBoundingClientRect();
  const bannerTop = bannerRect ? bannerRect.top : baseRect.top;
  const panelHeight = baseRect.bottom - bannerTop;

  if (positionCompactHomePanel(panel)) {
    homePanelMiniOpen = true;
    hideMiniButton();
    updateNearestDisabledState();
    return;
  }

  // 공간이 충분한지 확인
  const hasRightSpace = baseRect.right + gap + panelWidth <= viewportWidth - marginX;
  //const hasLeftSpace = baseRect.left - panelWidth - gap >= marginX;

  if (!hasRightSpace) {
    if (positionCompactHomePanel(panel)) {
      homePanelMiniOpen = true;
      hideMiniButton();
      updateNearestDisabledState();
      return;
    }

    showMiniButton(bannerRect, baseRect);
    updateNearestDisabledState();
    const miniBtn = document.getElementById("korail-nearest-mini-btn");
    const isOpen = miniBtn?.textContent.includes("닫기");
    // 공간 부족 → 패널 숨기고 미니 버튼 표시
    if (!homePanelMiniOpen) {
      panel.style.display = "none";
      panel.style.width = "";
      setHomeSidePanelShift(0);
    } else {
      positionMiniPanel(panel, miniBtn);
    }
    return;
  }
 
  homePanelMiniOpen = false;
  panel.style.display = "";
  panel.style.width = "";
  hideMiniButton();
  setHomeSidePanelShift(0);
  updateNearestDisabledState();

  const desiredLeft = hasRightSpace
    ? baseRect.right + gap
    : baseRect.left - panelWidth - gap;
  const maxLeft = viewportWidth - panelWidth - marginX;
  const left = Math.min(Math.max(marginX, desiredLeft), maxLeft);

  panel.style.position = "absolute";
  panel.style.top = `${bannerTop + window.scrollY}px`;
  panel.style.left = `${left + window.scrollX}px`;
  if (panelHeight > 0) panel.style.height = `${panelHeight}px`;
}

function positionMiniPanel(panel, btn) {
  if (positionCompactHomePanel(panel)) return;

  setHomeSidePanelShift(0);
  const gap = 6;
  const btnRect = btn.getBoundingClientRect();
  const panelWidth = panel.offsetWidth || 320;
  const panelHeight = panel.offsetHeight || 400;
  const hasRightSpace = btnRect.right + gap + panelWidth <= window.innerWidth;
  const leftPos = hasRightSpace
    ? btnRect.right + gap
    : btnRect.left - panelWidth - gap;
  const topPos = btnRect.bottom - panelHeight;

  panel.style.position = "absolute";
  panel.style.top = `${topPos + window.scrollY}px`;
  panel.style.left = `${leftPos + window.scrollX}px`;
  panel.style.zIndex = "9999";
  panel.style.height = "";
}

function showMiniButton(bannerRect, baseRect) {
  let btn = document.getElementById("korail-nearest-mini-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "korail-nearest-mini-btn";
    btn.textContent = "🚉 가까운 주요역 찾기";

    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      const panel = document.getElementById(HOME_PANEL_ID);
      if (!panel) return;
      const isOpen = panel.style.display !== "none";
      homePanelMiniOpen = !isOpen;
      panel.dataset.miniOpen = isOpen ? "false" : "true";
      btn.textContent = isOpen ? "🚉 가까운 주요역 찾기" : "✕ 닫기";
      panel.style.display = isOpen ? "none" : "";
      if (isOpen) {
        panel.style.width = "";
        setHomeSidePanelShift(0);
      }
      if (!isOpen) positionMiniPanel(panel, btn);
      updateNearestDisabledState();
    });
  }

  // 위치 계산
  const eventPop = document.querySelector("div.layer_wrap.event-pop");
  const ticketBox = document.querySelector("div.ticket_box");
  console.log("[Korail] showMiniButton - eventPop:", !!eventPop, "ticketBox:", !!ticketBox);

  if (eventPop && ticketBox) {
    const popRect = eventPop.getBoundingClientRect();
    const ticketRect = ticketBox.getBoundingClientRect();
    const midY = (popRect.bottom + ticketRect.top) / 2;

    btn.style.cssText = `
      position: absolute;
      top: ${midY + window.scrollY}px;
      left: ${popRect.left + window.scrollX}px;
      transform: translateY(-50%);
      z-index: 9999;
      padding: 10px 24px;
      background: #0052a4;
      color: white;
      border: none;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      white-space: nowrap;
    `;
  }

  btn.style.display = "";
  updateNearestDisabledState();
}
  
function hideMiniButton() {
  const btn = document.getElementById("korail-nearest-mini-btn");
  if (btn) btn.style.display = "none";
} 

function getNaverApiConfig() {
  return {
    clientId: window.KORAIL_MAP_CONFIG?.naverClientId?.trim() || "",
    clientSecret: window.KORAIL_MAP_CONFIG?.naverClientSecret?.trim() || ""
  };
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

function requestNaverApi(kind, payload) {
  return new Promise((resolve, reject) => {
    const requestId = `korail-map-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timeoutId = setTimeout(() => {
      window.removeEventListener("message", handleResponse);
      reject(new Error("Naver API 응답 시간이 초과되었습니다."));
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
        reject(new Error(buildGoogleApiError(response.error || "Naver API 요청에 실패했습니다.")));
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
          <span class="korail-nearest-list__meta">🚗 ${station.durationText} · 📍 ${station.distanceText}</span>
        </li>
      `).join("")}
    </ol>
  `;
}

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`;
  const response = await fetch(url, { headers: { "Accept-Language": "ko", "User-Agent": "KorailMapExtension/1.0" } });
  if (!response.ok) throw new Error(`Geocoding 요청 실패: ${response.status}`);
  const data = await response.json();
  if (!data[0]) throw new Error("주소나 장소를 찾을 수 없습니다.");
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
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

async function getRoutesInfo(origin, stations) {
  const { clientId, clientSecret } = getNaverApiConfig();
  const results = await Promise.all(stations.map(async (station) => {
    try {
      const drivingData = await requestNaverApi("driving", { clientId, clientSecret, startLat: origin.lat, startLng: origin.lng, goalLat: station.lat, goalLng: station.lng });
      const drivingSummary = drivingData.route?.trafast?.[0]?.summary;
      if (!drivingSummary) return null;
      return {
        ...station,
        durationSeconds: drivingSummary.duration / 1000,
        durationText: formatDuration(drivingSummary.duration / 1000),
        distanceText: formatDistance(drivingSummary.distance),
        distanceMeters: drivingSummary.distance,
      };
    } catch {
      return null;
    }
  }));
  return results.filter(Boolean);
}

async function searchNearestStations(panel) {
  const input = panel.querySelector("[data-nearest-address]");
  const address = input?.value.trim().replace(/([가-힣])\s+(\d+(길|로|가))/g, "$1$2");
  console.warn(address);
  if (!address) {
    renderNearestResults(panel, "error", "주소나 장소명을 입력해 주세요.");
    input?.focus();
    return;
  }
  try {
    renderNearestResults(panel, "loading", "계산 중입니다.");
    const origin = await geocodeAddress(address);
    const top5 = getNearestByDistance(origin, 5);
    const results = await getRoutesInfo(origin, top5);
    results.sort((a, b) => a.durationSeconds - b.durationSeconds);
    renderNearestResults(panel, "done", "가까운 주요역", results.slice(0, 3));
  } catch (error) {
    renderNearestResults(panel, "error", error.message || "조회 중 오류가 발생했습니다.");
  }
}

function bindHomeNearestPanel(panel) {
  const form = panel.querySelector("[data-nearest-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchNearestStations(panel);
  });
}

function injectHomeNearestPanel() {
  if (isLoginPage()) {
    cleanupHomeNearestPanel();
    return;
  }

  const existingPanel = document.getElementById(HOME_PANEL_ID);
  if (existingPanel) {
    positionHomeNearestPanel(existingPanel);
    return;
  }
  if (document.querySelector(".tckWrap")) {
    cleanupHomeNearestPanel();
    return;
  }

  const isIntroPage = location.pathname.includes("/intro");

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
      <div class="korail-nearest-card__result" data-nearest-result aria-live="polite">
        <span class="korail-nearest-card__result-label">조회 결과</span>
        <strong>주소 입력 후 검색</strong>
        <small>거리순은 Geocoding API를 사용합니다.</small>
      </div>
    </div>
  `;

  if (isIntroPage) {
    injectIntroPanel(panel);
  } else {
    document.body.appendChild(panel);
    bindHomeNearestPanel(panel);
    positionHomeNearestPanel(panel);
    updateNearestDisabledState();
  }
}

function injectIntroPanel(panel) {
  console.log("[Korail] injectIntroPanel called");
  const searchBtn = document.querySelector("button.search_btn");
  const searchSection = document.querySelector("section.search");
  console.log("[Korail] searchBtn:", !!searchBtn, "searchSection:", !!searchSection);
  if (!searchBtn || !searchSection) return;

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "korail-intro-toggle-btn";
  toggleBtn.textContent = "🚉 가까운 주요역 찾기";

  panel.style.cssText = `
    position: fixed;
    z-index: 9998;
    display: none;
    width: 340px;
  `;

  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
  bindHomeNearestPanel(panel);

  function positionToggleBtn() {
    const btnRect = searchBtn.getBoundingClientRect();
    const sectionRect = searchSection.getBoundingClientRect();
    //console.log("[Korail] searchBtn rect:", btnRect.left, btnRect.width, btnRect.right);
    toggleBtn.style.cssText = `
      position: fixed;
      top: ${sectionRect.bottom + 8}px;
      left: ${btnRect.left + btnRect.width / 2}px;
      transform: translateX(-50%);
      width: ${btnRect.width}px;
      z-index: 9999;
      padding: 10px 0;
      background: #0052a4;
      color: white;
      border: none;
      border-radius: 999px;
      font-size: 14px;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      white-space: nowrap;
      text-align: center;
    `;
  }

  positionToggleBtn();
  updateNearestDisabledState();
  window.addEventListener("resize", positionToggleBtn);

  toggleBtn.addEventListener("click", () => {
    const isOpen = panel.style.display !== "none";
    if (!isOpen) {
      const btnRect = toggleBtn.getBoundingClientRect();
      const panelWidth = 340;
      const panelHeight = panel.offsetHeight || 400;

      const hasRightSpace = btnRect.right + panelWidth <= window.innerWidth;
      const leftPos = hasRightSpace
        ? btnRect.right
        : btnRect.left - panelWidth;
      const topPos = btnRect.bottom - panelHeight;

      panel.style.top = `${topPos + window.scrollY}px`;
      panel.style.left = `${leftPos + window.scrollX}px`;
    }
    panel.style.display = isOpen ? "none" : "";
    toggleBtn.textContent = isOpen ? "🚉 가까운 주요역 찾기" : "✕ 닫기";
    updateNearestDisabledState();
  });
}

window.injectHomeFeature = injectHomeNearestPanel;

function tryInit() {
  if (isLoginPage()) {
    cleanup();
    cleanupHomeNearestPanel();
    return;
  }

  const depEl = document.querySelector("#labelstart");
  const arrEl = document.querySelector("#labelend");
  const dep = depEl?.value.trim() || document.querySelector(".station_item.n1 span.input")?.textContent.trim() || "";
  const arr = arrEl?.value.trim() || document.querySelector(".station_item.n2 span.input")?.textContent.trim() || "";

  // intro 페이지 아닐 때 토글 버튼 제거
  if (!location.pathname.includes("/intro")) {
    document.getElementById("korail-intro-toggle-btn")?.remove();
    //document.getElementById(HOME_PANEL_ID)?.remove();
  }

  // tckWrap 없으면 패널 정리 후 종료
  if (!document.querySelector(".tckWrap")) {
    cleanup();
    injectHomeNearestPanel();
    return;
  }

  cleanupHomeNearestPanel();

  if (!depEl || !arrEl) return;

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

let tryInitTimer = null;
const spaObserver = new MutationObserver(() => {
  clearTimeout(tryInitTimer);
  tryInitTimer = setTimeout(() => {
    tryInit();
    updateNearestDisabledState();
  }, 300);
});
spaObserver.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class", "style", "aria-hidden"],
});
window.addEventListener("resize", () => {
  if (isLoginPage()) {
    cleanupHomeNearestPanel();
    return;
  }
  const panel = document.getElementById(HOME_PANEL_ID);
  if (panel) positionHomeNearestPanel(panel);
  updateNearestDisabledState();
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
  bindTrainRowClick(dep, arr);
}

function bindTrainRowClick(dep, arr) {
  function bind() {
    document.querySelectorAll(".tckList").forEach((row) => {
      if (row._korailBound) return;
      row._korailBound = true;
      row.addEventListener("click", () => {
        setTimeout(() => fetchTrainStations(dep, arr), 100);
      });
    });
  }

  bind();

  const observer = new MutationObserver(() => bind());
  observer.observe(document.querySelector(".tckWrap") || document.body, {
    childList: true,
    subtree: true,
  });
}
window.fetchTrainStations = fetchTrainStations;

function fetchTrainStations(dep, arr) {
  console.warn("[Korail] fetchTrainStations called", dep, arr);
  const timeBtn = document.querySelectorAll(".reserv_center a")[0];
  console.warn("[Korail] timeBtn:", timeBtn);
  if (!timeBtn) return;

  timeBtn.click();

  const observer = new MutationObserver(() => {
    const modal = document.querySelector(".ReactModal__Content .sh-table");
    if (!modal) return;
    observer.disconnect();
    //console.warn("[Korail] modal found, stations:", stationNames);

    const stationNames = [...modal.querySelectorAll("li .tit")].map(el => el.textContent.trim());
    const closeBtn = document.querySelector(".ReactModal__Content .btn_close");
    closeBtn?.click();

    const stations = stationNames
      .filter(name => STATIONS[name])
      .map(name => ({ name, ...STATIONS[name] }));

    if (stations.length < 2) return;

    const map = window._korailMapInstance;
    if (!map) return;

    map.eachLayer(layer => {
      if (layer instanceof L.Polyline || layer instanceof L.Marker) {
        if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
      }
    });

    const selCoords = stations.map(s => [s.lat, s.lng]);
    if (selCoords.length >= 2) {
      L.polyline(selCoords, { color: "#cccccc", weight: 3 }).addTo(map);
    }

    const depIndex = stations.findIndex(s => s.name === dep);
    const arrIndex = stations.findIndex(s => s.name === arr);
    const routeStations = depIndex >= 0 && arrIndex >= 0
      ? stations
        .slice(Math.min(depIndex, arrIndex), Math.max(depIndex, arrIndex) + 1)
      : stations;
    const routeCoords = routeStations.map(s => [s.lat, s.lng]);
    const routeNames = new Set(routeStations.map(s => s.name));
    if (routeCoords.length >= 2) {
      L.polyline(routeCoords, { color: "#1A3A6B", weight: 4 }).addTo(map);
    }

    stationNames.forEach(name => {
      if (!STATIONS[name]) return;
      const coords = STATIONS[name];
      if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
      const isDep = name === dep;
      const isArr = name === arr;
      const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : routeNames.has(name) ? "is-active" : "is-gray";
      const icon = L.divIcon({
        className: "",
        html: `<div class="korail-dot-wrap ${isDep || isArr ? "is-label" : ""}">
                ${isDep || isArr
                  ? `<span class="korail-dot-label ${dotClass}">${name}</span>`
                  : `<div class="korail-dot ${dotClass}"></div>`}
              </div>`,
        iconSize: isDep || isArr ? [0, 0] : [12, 12],
        iconAnchor: isDep || isArr ? [0, 0] : [6, 6],
      });
      L.marker([coords.lat, coords.lng], { icon })
        .addTo(map)
        .bindTooltip(name, { permanent: false, direction: "top" });
    });

    map.fitBounds(selCoords, { padding: [30, 30] });
  });

  observer.observe(document.body, { childList: true, subtree: true });
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

  const currentDep = document.querySelector("#labelstart")?.value.trim() ||
    document.querySelector(".station_item.n1 span.input")?.textContent.trim() || "";
  const currentArr = document.querySelector("#labelend")?.value.trim() ||
    document.querySelector(".station_item.n2 span.input")?.textContent.trim() || "";

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
