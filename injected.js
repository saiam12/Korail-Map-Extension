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

  const TEXT = {
    ko: {
      nearestTitle: "가까운 주요역 찾기",
      currentLocation: "현재 위치 기반",
      nearestDescription: "주소를 입력하면 가까운 KTX 주요역 TOP 3를 찾아줍니다.",
      departureLocation: "출발 위치",
      addressPlaceholder: "예: 서울시청, 대구 수성구",
      search: "검색",
      result: "조회 결과",
      searchAfterAddress: "주소 입력 후 검색",
      distanceHint: "거리순은 Geocoding API를 사용합니다.",
      enterAddress: "주소를 입력해 주세요",
      findingStations: "주요역을 찾는 중입니다",
      unavailable: "조회할 수 없습니다",
      enterAddressError: "주소나 장소명을 입력해 주세요.",
      calculating: "계산 중입니다.",
      nearestStations: "가까운 주요역",
      searchError: "조회 중 오류가 발생했습니다.",
      geocodeFailed: "Geocoding 요청 실패",
      geocodeNotFound: "주소나 장소를 찾을 수 없습니다.",
      close: "닫기",
      hour: "시간",
      minute: "분",
    },
    en: {
      nearestTitle: "Find Nearby Major Stations",
      currentLocation: "Based on current location",
      nearestDescription: "Enter an address to find the top 3 nearby major KTX stations.",
      departureLocation: "Departure location",
      addressPlaceholder: "e.g. Seoul City Hall, Suseong-gu Daegu",
      search: "Search",
      result: "Search Results",
      searchAfterAddress: "Search after entering an address",
      distanceHint: "Distance is calculated using the Geocoding API.",
      enterAddress: "Please enter an address",
      findingStations: "Finding major stations",
      unavailable: "Unable to search",
      enterAddressError: "Please enter an address or place name.",
      calculating: "Calculating.",
      nearestStations: "Nearby Major Stations",
      searchError: "An error occurred while searching.",
      geocodeFailed: "Geocoding request failed",
      geocodeNotFound: "Address or place not found.",
      close: "Close",
      hour: "hr",
      minute: "min",
    },
  };

  const STATION_EN = {
    "서울": "Seoul",
    "용산": "Yongsan",
    "광명": "Gwangmyeong",
    "수서": "Suseo",
    "영등포": "Yeongdeungpo",
    "수원": "Suwon",
    "평택": "Pyeongtaek",
    "평택지제": "PyeongtaekJije",
    "천안아산": "CheonanAsan",
    "천안": "Cheonan",
    "오송": "Osong",
    "조치원": "Jochiwon",
    "대전": "Daejeon",
    "서대전": "Seodaejeon",
    "김천": "Gimcheon",
    "김천구미": "Gimcheon Gumi",
    "구미": "Gumi",
    "동대구": "Dongdaegu",
    "대구": "Daegu",
    "서대구": "Seodaegu",
    "경주": "Gyeongju",
    "울산(통도사)": "Ulsan",
    "태화강": "Taehwagang",
    "포항": "Pohang",
    "경산": "Gyeongsan",
    "밀양": "Miryang",
    "부산": "Busan",
    "구포": "Gupo",
    "창원중앙": "ChangwonJungang",
    "마산": "Masan",
    "진주": "Jinju",
    "평창": "Pyeongchang",
    "진부(오대산)": "Jinbu",
    "강릉": "Gangneung",
    "익산": "Iksan",
    "논산": "Nonsan",
    "전주": "Jeonju",
    "광주송정": "Gwangjusongjeong",
    "목포": "Mokpo",
    "대천": "Daecheon",
    "순천": "Suncheon",
    "청량리": "Cheongnyangni",
    "제천": "Jecheon",
    "여수EXPO": "Yeosu-Expo",
    "동해": "Donghae",
    "정동진": "Jeongdongjin",
    "춘천": "Chuncheon",
    "남춘천": "Namchuncheon",
    "부전": "Bujeon",
    "신탄진": "Sintanjin",
    "영동": "Yeongdong",
    "왜관": "Waegwan",
    "홍성": "Hongseong",
    "안동": "Andong",
    "서원주": "Seowonju",
    "원주": "Wonju",
    "행신": "Haengsin",
    "나주": "Naju",
    "정읍": "Jeongeup",
    "남원": "Namwon",
  };
  function normalizeStationLabel(label) {
    return (label || "")
      .trim()
      .toLowerCase()
      .replace(/\bstation\b/g, "")
      .replace(/[\s\-()]/g, "");
  }

  const STATION_KEY_BY_EN = Object.fromEntries(
    Object.entries(STATION_EN).map(([ko, en]) => [normalizeStationLabel(en), ko])
  );

  function getKorailLocale() {
    const lang = document.documentElement.lang?.toLowerCase() || "";
    if (lang.startsWith("en")) return "en";

    const text = document.body?.innerText || "";
    if (/\b(Departure|Arrival|Search|Station Information|Passenger\(s\)|TICKETS)\b/.test(text)) return "en";
    return "ko";
  }

  function t(key) {
    const locale = getKorailLocale();
    return TEXT[locale]?.[key] || TEXT.ko[key] || key;
  }

  function stationName(name) {
    return getKorailLocale() === "en" ? (STATION_EN[name] || name) : name;
  }

  function stationKey(label) {
    const clean = (label || "").trim();
    if (STATIONS[clean]) return clean;
    return STATION_KEY_BY_EN[normalizeStationLabel(clean)] || clean;
  }

  function findStationKeyInText(text) {
    const value = text || "";
    const koMatch = Object.keys(STATIONS)
      .map((name) => {
        const index = value.lastIndexOf(name);
        return { name, index, end: index + name.length };
      })
      .filter((item) => item.index >= 0)
      .sort((a, b) => b.end - a.end || b.name.length - a.name.length)[0]?.name;
    if (koMatch) return koMatch;

    const normalized = normalizeStationLabel(value);
    return Object.entries(STATION_EN)
      .map(([name, en]) => {
        const key = normalizeStationLabel(en);
        const index = normalized.lastIndexOf(key);
        return { name, index, end: index + key.length };
      })
      .filter((item) => item.index >= 0)
      .sort((a, b) => b.end - a.end || b.name.length - a.name.length)[0]?.name || "";
  }

  function getCurrentStationKey(type) {
    const selectors = type === "dep"
      ? ["#labelstart", "#txtGoStart", ".station_item.n1 span.input", "input[id*='start' i]", "input[name*='start' i]", "input[id*='dep' i]", "input[name*='dep' i]"]
      : ["#labelend", "#txtGoEnd", ".station_item.n2 span.input", "input[id*='end' i]", "input[name*='end' i]", "input[id*='arr' i]", "input[name*='arr' i]"];

    for (const selector of selectors) {
      for (const el of document.querySelectorAll(selector)) {
        const text = el.value || el.textContent || "";
        const name = stationKey(text);
        if (STATIONS[name]) return name;
        const found = findStationKeyInText(text);
        if (found) return found;
      }
    }

    const labelPattern = type === "dep" ? /(Departure|출발)/i : /(Arrival|도착)/i;
    const label = [...document.querySelectorAll("label, th, dt, span, strong, div")]
      .find((el) => labelPattern.test(el.textContent || ""));
    const nearbyText = [
      label?.textContent,
      label?.nextElementSibling?.textContent,
      label?.parentElement?.textContent,
    ].filter(Boolean).join(" ");
    return findStationKeyInText(nearbyText);
  }

  window.KORAIL_I18N = { getLocale: getKorailLocale, t, stationName, stationKey };

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

  const desiredLeft = baseRect.right + gap;
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

function nearestToggleText(isOpen) {
  return isOpen ? `✕ ${t("close")}` : `🚉 ${t("nearestTitle")}`;
}

function showMiniButton(bannerRect, baseRect) {
  let btn = document.getElementById("korail-nearest-mini-btn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "korail-nearest-mini-btn";
    btn.textContent = nearestToggleText(false);

    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
      const panel = document.getElementById(HOME_PANEL_ID);
      if (!panel) return;
      const isOpen = panel.style.display !== "none";
      homePanelMiniOpen = !isOpen;
      panel.dataset.miniOpen = isOpen ? "false" : "true";
      btn.textContent = nearestToggleText(!isOpen);
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

  if (btn.style.display !== "none" && !homePanelMiniOpen) btn.textContent = nearestToggleText(false);
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
  if (minutes < 60) return getKorailLocale() === "en" ? `${minutes} ${t("minute")}` : `${minutes}분`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  if (getKorailLocale() === "en") return remain ? `${hours} ${t("hour")} ${remain} ${t("minute")}` : `${hours} ${t("hour")}`;
  return remain ? `${hours}시간 ${remain}분` : `${hours}시간`;
}

function renderNearestResults(panel, state, message, stations = []) {
  const result = panel.querySelector("[data-nearest-result]");
  if (!result) return;

  const stateLabel = {
    idle: t("enterAddress"),
    loading: t("findingStations"),
    error: t("unavailable"),
    done: message,
  }[state] || message;
  const safeStateLabel = escapeHtml(stateLabel);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br>");

  if (state !== "done") {
    result.innerHTML = `
      <span class="korail-nearest-card__result-label">${t("result")}</span>
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
          <span class="korail-nearest-list__name">${escapeHtml(stationName(station.name))}</span>
          <span class="korail-nearest-list__meta">🚗 ${station.durationText} · 📍 ${station.distanceText}</span>
        </li>
      `).join("")}
    </ol>
  `;
}

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`;
  const response = await fetch(url, { headers: { "Accept-Language": getKorailLocale(), "User-Agent": "KorailMapExtension/1.0" } });
  if (!response.ok) throw new Error(`${t("geocodeFailed")}: ${response.status}`);
  const data = await response.json();
  if (!data[0]) throw new Error(t("geocodeNotFound"));
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
  if (!address) {
    renderNearestResults(panel, "error", t("enterAddressError"));
    input?.focus();
    return;
  }
  try {
    renderNearestResults(panel, "loading", t("calculating"));
    const origin = await geocodeAddress(address);
    const top5 = getNearestByDistance(origin, 5);
    const results = await getRoutesInfo(origin, top5);
    results.sort((a, b) => a.durationSeconds - b.durationSeconds);
    renderNearestResults(panel, "done", t("nearestStations"), results.slice(0, 3));
  } catch (error) {
    renderNearestResults(panel, "error", error.message || t("searchError"));
  }
}

function bindHomeNearestPanel(panel) {
  const form = panel.querySelector("[data-nearest-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    searchNearestStations(panel);
  });
}

function renderHomeNearestPanel(panel) {
  panel.dataset.korailLang = getKorailLocale();
  panel.setAttribute("aria-label", t("nearestTitle"));
  panel.innerHTML = `
    <div class="korail-nearest-card">
      <div class="korail-nearest-card__head">
        <span class="korail-nearest-card__eyebrow">${t("currentLocation")}</span>
        <h2>${t("nearestTitle")}</h2>
        <p>${t("nearestDescription")}</p>
      </div>
      <form class="korail-nearest-search" data-nearest-form>
        <label class="korail-nearest-search__label" for="korail-nearest-address">${t("departureLocation")}</label>
        <div class="korail-nearest-search__row">
          <input id="korail-nearest-address" data-nearest-address type="text" placeholder="${t("addressPlaceholder")}" autocomplete="street-address">
          <button type="submit" class="korail-nearest-card__button">${t("search")}</button>
        </div>
      </form>
      <div class="korail-nearest-card__result" data-nearest-result aria-live="polite">
        <span class="korail-nearest-card__result-label">${t("result")}</span>
        <strong>${t("searchAfterAddress")}</strong>
        <small>${t("distanceHint")}</small>
      </div>
    </div>
  `;
}

function injectHomeNearestPanel() {
  if (isLoginPage()) {
    cleanupHomeNearestPanel();
    return;
  }

  const existingPanel = document.getElementById(HOME_PANEL_ID);
  if (existingPanel) {
    if (existingPanel.dataset.korailLang !== getKorailLocale()) {
      renderHomeNearestPanel(existingPanel);
      bindHomeNearestPanel(existingPanel);
    }
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
  renderHomeNearestPanel(panel);

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
  toggleBtn.textContent = nearestToggleText(false);

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
    toggleBtn.textContent = nearestToggleText(!isOpen);
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
  const dep = stationKey(depEl?.value.trim() || document.querySelector(".station_item.n1 span.input")?.textContent.trim() || "");
  const arr = stationKey(arrEl?.value.trim() || document.querySelector(".station_item.n2 span.input")?.textContent.trim() || "");

  // intro 페이지 아닐 때 토글 버튼 제거
  if (!location.pathname.includes("/intro")) {
    document.getElementById("korail-intro-toggle-btn")?.remove();
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

let isFetchingTrainStations = false;
let bottomTrainTimeTimer = null;
let selectedTransferRouteKey = "";
const selectedTransferRouteGroups = new Map();

function bindTrainRowClick(dep, arr) {
  function bind() {
    document.querySelectorAll(".tckList").forEach((row) => {
      if (row._korailBound) return;
      row._korailBound = true;
      row.addEventListener("click", (event) => {
        // 버튼/링크 클릭은 무시 (열차시각, 운임요금, 예매 등)
        if (event.target.closest("a, button")) {
          clearTimeout(bottomTrainTimeTimer);
          bottomTrainTimeTimer = setTimeout(() => {
            fetchBottomBarTrainStations(dep, arr, event.currentTarget);
          }, 250);
          return;
        }
        return;
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

function findStationInText(text) {
  const value = text || "";
  return Object.keys(STATIONS)
    .map((name) => {
      const index = value.lastIndexOf(name);
      return { name, index, end: index + name.length };
    })
    .filter((item) => item.index >= 0)
    .sort((a, b) => b.end - a.end || b.name.length - a.name.length)[0]?.name || "";
}

function getTrainRowSegment(row) {
  if (!row) return null;
  const candidates = [...row.querySelectorAll("a, button, span, strong, p, div, li")]
    .map((el) => el.textContent.trim())
    .filter((text) => (text.match(/→/g) || []).length === 1)
    .sort((a, b) => a.length - b.length);
  const parse = (text) => {
    const [left, right] = (text || "").split("→");
    const dep = stationKey(findStationInText(left));
    const arr = stationKey(findStationInText(right));
    return dep && arr ? { dep, arr } : null;
  };
  return parse(candidates[0]) || parse(row.textContent);
}

function getTrainRowSegments(row) {
  const segments = [...row.querySelectorAll("a, button, span, strong, p, div, li")]
    .map((el) => el.textContent.trim())
    .filter((text) => (text.match(/→/g) || []).length === 1)
    .map((text) => {
      const [left, right] = text.split("→");
      const dep = stationKey(findStationInText(left));
      const arr = stationKey(findStationInText(right));
      return dep && arr ? { dep, arr } : null;
    })
    .filter(Boolean);
  const unique = [];
  segments.forEach((segment) => {
    if (!unique.some((item) => item.dep === segment.dep && item.arr === segment.arr)) {
      unique.push(segment);
    }
  });
  return unique.length ? unique : [getTrainRowSegment(row)].filter(Boolean);
}

function getConnectedTrainRows(clickedRow) {
  const rows = [...document.querySelectorAll(".tckWrap .tckList")];
  const segments = rows.map((row) => ({ row, segment: getTrainRowSegment(row) }));
  const index = rows.indexOf(clickedRow);
  const clickedSegments = getTrainRowSegments(clickedRow);
  if (clickedSegments.length > 1) {
    return clickedSegments.map((segment, segmentIndex) => ({ row: clickedRow, segment, segmentIndex }));
  }
  if (index < 0 || !segments[index].segment) return [{ row: clickedRow, segment: null, segmentIndex: 0 }];

  let start = index;
  let end = index;
  while (
    start > 0 &&
    segments[start - 1].segment &&
    segments[start].segment &&
    segments[start - 1].segment.arr === segments[start].segment.dep
  ) start--;
  while (
    end + 1 < segments.length &&
    segments[end].segment &&
    segments[end + 1].segment &&
    segments[end].segment.arr === segments[end + 1].segment.dep
  ) end++;

  return segments.slice(start, end + 1).map((item) => ({ ...item, segmentIndex: 0 }));
}

function getTransferRouteInfo(clickedRow) {
  const rows = getConnectedTrainRows(clickedRow);
  const index = rows.findIndex((item) => item.row === clickedRow);
  const key = rows
    .map((item) => `${item.segment?.dep || ""}-${item.segment?.arr || ""}`)
    .join("|");
  return { rows, index: Math.max(index, 0), key };
}

function getTransferActiveStations(stationNames, segment, transferInfo) {
  if (!stationNames.length) return [];
  if (!segment || transferInfo.rows.length <= 1) return stationNames;

  const isFirst = transferInfo.index === 0;
  const isLast = transferInfo.index === transferInfo.rows.length - 1;
  const from = isFirst ? stationNames[0] : segment.dep;
  const to = isLast ? stationNames.at(-1) : segment.arr;
  return sliceTrainStations(stationNames, from, to);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findButtonByText(root, ...keywords) {
  // 텍스트 또는 aria-label로 버튼/링크 탐색
  const els = [...(root || document).querySelectorAll("a, button")];
  for (const kw of keywords) {
    const found = els.find((el) => {
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      return text.includes(kw);
    });
    if (found) return found;
  }
  return null;
}

async function getTrainTimeButton(row, index = 0) {
  if (!row) return null;
  const timeButtons = [...row.querySelectorAll("a, button")]
    .filter((el) => {
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      return text.includes("Time");
    });
  if (timeButtons[index]) return timeButtons[index];
  if (timeButtons[0]) return timeButtons[0];
  const fallbackButtons = [...row.querySelectorAll(".reserv_center a")];
  if (fallbackButtons[index]) return fallbackButtons[index];
  if (fallbackButtons[0]) return fallbackButtons[0];
  // 텍스트 우선 탐색
  const byText = findButtonByText(row, "열차시각", "시각", "Time");
  if (byText) return byText;
  // fallback: .reserv_center 첫 번째 a
  return null;
}

// async function getTrainFareButton(row) {
//   if (!row) return null;
//   const byText = findButtonByText(row, "운임요금", "요금", "Fare");
//   if (byText) return byText;
//   // fallback: .reserv_center 두 번째 a
//   const btns = row.querySelectorAll(".reserv_center a");
//   return btns[1] || btns[0] || null;
// }

function waitModalGone(timeout = 2000) {
  return new Promise((resolve) => {
    if (!document.querySelector(".ReactModal__Content")) { resolve(); return; }
    const obs = new MutationObserver(() => {
      if (!document.querySelector(".ReactModal__Content")) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(); }, timeout);
    document.querySelector(".ReactModal__Content .btn_close")?.click();
  });
}

function extractStopStationsFromTimeModal(modal) {
  const root = modal?.querySelector(".sh-table") || modal;
  if (!root) return [];

  const stationNames = [];
  const addStation = (text) => {
    const name = stationKey(findStationKeyInText(text) || findStationInText(text) || text);
    if (!STATIONS[name] || stationNames.at(-1) === name) return;
    stationNames.push(name);
  };

  root
    .querySelectorAll("li .tit, .tit, li strong, td:first-child, th:first-child")
    .forEach((el) => addStation(el.textContent || ""));

  if (stationNames.length < 2) {
    (root.innerText || "")
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const found = findStationKeyInText(line) || findStationInText(line);
        if (found) addStation(found);
      });
  }

  return stationNames;
}

function waitTrainTimeStations(timeBtn) {
  return new Promise((resolve) => {
    if (!timeBtn) { resolve([]); return; }

    const readModal = () => {
      const modal = document.querySelector(".ReactModal__Content");
      if (!modal) return null;
      const stationNames = extractStopStationsFromTimeModal(modal);
      const unique = [];
      stationNames.forEach((name) => { if (unique.at(-1) !== name) unique.push(name); });
      return unique.length >= 2 ? unique : null;
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      obs.disconnect();
      clearTimeout(timer);
      // 닫기 버튼 클릭
      document.querySelector(".ReactModal__Content .btn_close")?.click();
      resolve(result || []);
    };

    const timer = setTimeout(() => finish([]), 10000);

    const obs = new MutationObserver(() => {
      if (settled) return;
      const result = readModal();
      if (result) finish(result);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // 이미 열려있으면 즉시 읽기
    const immediate = readModal();
    if (immediate) { finish(immediate); return; }
    timeBtn.click();
  });
}

// function waitTrainFareTexts(fareBtn) {
//   return new Promise((resolve) => {
//     if (!fareBtn) { resolve([]); return; }

//     const readModal = () => {
//       const modal = document.querySelector(".ReactModal__Content");
//       if (!modal) return null;
//       const matches = [...new Set((modal.textContent || "").match(/\d{1,3}(?:,\d{3})*원/g) || [])];
//       return matches.length ? matches : null;
//     };

//     let settled = false;
//     const finish = (result) => {
//       if (settled) return;
//       settled = true;
//       obs.disconnect();
//       clearTimeout(timer);
//       document.querySelector(".ReactModal__Content .btn_close")?.click();
//       resolve(result || []);
//     };

//     const timer = setTimeout(() => finish([]), 4000);
//     const obs = new MutationObserver(() => {
//       if (settled) return;
//       const result = readModal();
//       if (result) finish(result);
//     });
//     obs.observe(document.body, { childList: true, subtree: true });

//     const immediate = readModal();
//     if (immediate) { finish(immediate); return; }
//     fareBtn.click();
//   });
// }

// function updateTrainFareDisplay(row, fareTexts) {
//   if (!row || !fareTexts?.length) return;

//   const targetBoxes = [...row.querySelectorAll(".price_box")]
//     .filter((box) => !box.querySelector(".txt_price") && !/매진/.test(box.textContent || ""));

//   fareTexts.forEach((fareText, index) => {
//     const targetBox = targetBoxes[index];
//     if (!targetBox) return;

//     const inner = targetBox.querySelector(".inner.type02") || targetBox;
//     const existingSeat = inner.querySelector(".txt_ch");
//     const existingBenefit = inner.querySelector(".txt_gr");
//     const price = document.createElement("p");
//     price.className = "txt_price txt_bk";
//     price.textContent = fareText;

//     if (existingBenefit && existingBenefit.parentNode === inner) {
//       inner.insertBefore(price, existingBenefit);
//     } else if (existingSeat && existingSeat.parentNode === inner) {
//       inner.insertBefore(price, existingSeat.nextSibling);
//     } else {
//       inner.appendChild(price);
//     }
//   });
// }

function sliceTrainStations(stationNames, dep, arr) {
  const depIndex = stationNames.findIndex((name) => name === dep);
  const arrIndex = stationNames.findIndex((name) => name === arr);
  if (depIndex < 0 || arrIndex < 0) return stationNames;
  const routeNames = stationNames.slice(Math.min(depIndex, arrIndex), Math.max(depIndex, arrIndex) + 1);
  return depIndex > arrIndex ? routeNames.reverse() : routeNames;
}

function getFallbackSegmentStations(dep, arr) {
  const result = findRoute(dep, arr);
  if (!result) return [dep, arr].filter((name) => STATIONS[name]);

  const { route, depIdx, arrIdx } = result;
  const routeNames = route.stations.slice(Math.min(depIdx, arrIdx), Math.max(depIdx, arrIdx) + 1);
  return depIdx > arrIdx ? routeNames.reverse() : routeNames;
}

function getFallbackRouteStations(dep, arr) {
  const result = findRoute(dep, arr);
  if (!result) return [dep, arr].filter((name) => STATIONS[name]);

  const { route, depIdx, arrIdx } = result;
  const routeNames = [...route.stations];
  return depIdx > arrIdx ? routeNames.reverse() : routeNames;
}

function drawTrainStations(dep, arr, stationGroups) {
  const map = window._korailMapInstance;
  if (!map) return;

  // eachLayer 중 삭제는 불안정 → 먼저 수집 후 삭제
  const toRemove = [];
  map.eachLayer((layer) => {
    if (layer instanceof L.Polyline || layer instanceof L.Marker) {
      toRemove.push(layer);
    }
  });
  toRemove.forEach((layer) => map.removeLayer(layer));

  const grayMarkerNames = new Set();
  const activeMarkerNames = new Set();
  const boundsCoords = [];

  stationGroups.forEach((group) => {
    const fullStations = (group.fullStations || [])
      .filter(name => STATIONS[name])
      .map(name => ({ name, ...STATIONS[name] }));
    const activeStations = (group.activeStations || [])
      .filter(name => STATIONS[name])
      .map(name => ({ name, ...STATIONS[name] }));

    if (fullStations.length < 2) return;

    fullStations.forEach((station) => {
      grayMarkerNames.add(station.name);
      boundsCoords.push([station.lat, station.lng]);
    });

    L.polyline(fullStations.map((s) => [s.lat, s.lng]), { color: "#c4c8d0", weight: 3 }).addTo(map);

    if (activeStations.length >= 2) {
      activeStations.forEach((station) => {
        activeMarkerNames.add(station.name);
        boundsCoords.push([station.lat, station.lng]);
      });
      L.polyline(activeStations.map((s) => [s.lat, s.lng]), { color: "#1A3A6B", weight: 4 }).addTo(map);
    }
  });

  if (boundsCoords.length < 2) return;

  [...grayMarkerNames].forEach(name => {
    if (!STATIONS[name]) return;
    const coords = STATIONS[name];
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
    const isDep = name === dep;
    const isArr = name === arr;
    if (activeMarkerNames.has(name)) return;
    const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : "is-gray";
    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap ${isDep || isArr ? "is-label" : ""}">
          ${isDep || isArr
          ? `<span class="korail-dot-label ${dotClass}">${stationName(name)}</span>`
          : `<div class="korail-dot ${dotClass}"></div>`}
              </div>`,
      iconSize: isDep || isArr ? [0, 0] : [12, 12],
      iconAnchor: isDep || isArr ? [0, 0] : [6, 6],
    });
    L.marker([coords.lat, coords.lng], { icon })
      .addTo(map)
      .bindTooltip(stationName(name), { permanent: false, direction: "top" });
  });

  [...activeMarkerNames].forEach(name => {
    if (!STATIONS[name]) return;
    const coords = STATIONS[name];
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
    const isDep = name === dep;
    const isArr = name === arr;
    const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : "is-active";
    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap ${isDep || isArr ? "is-label" : ""}">
          ${isDep || isArr
          ? `<span class="korail-dot-label ${dotClass}">${stationName(name)}</span>`
          : `<div class="korail-dot ${dotClass}"></div>`}
              </div>`,
      iconSize: isDep || isArr ? [0, 0] : [12, 12],
      iconAnchor: isDep || isArr ? [0, 0] : [6, 6],
    });
    L.marker([coords.lat, coords.lng], { icon })
      .addTo(map)
      .bindTooltip(stationName(name), { permanent: false, direction: "top" });
  });

  map.fitBounds(boundsCoords, { padding: [30, 30] });
}

function isVisibleButton(el) {
  const rect = el?.getBoundingClientRect?.();
  return !!rect
    && rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

function findBottomTrainTimeButton() {
  return [...document.querySelectorAll("a, button")]
    .filter((el) => {
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      return text.includes("열차시각") || /Train\s*Time|Time/i.test(text)
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    })
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
}

function findSelectedBottomTrainTimeButton() {
  return [...document.querySelectorAll("a, button")]
    .filter((el) => {
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      const isTimeButton = text.includes("\uC5F4\uCC28\uC2DC\uAC01") || /Train\s*Time|Time/i.test(text);
      return isTimeButton
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    })
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
}

function waitBottomTrainTimeButton(timeout = 2500) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      const button = findSelectedBottomTrainTimeButton();
      if (button || Date.now() - startedAt >= timeout) {
        resolve(button);
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

async function fetchBottomBarTrainStations(dep, arr, clickedRow) {
  if (isFetchingTrainStations) return;

  const timeBtn = await waitBottomTrainTimeButton();
  if (!timeBtn) return;

  isFetchingTrainStations = true;
  try {
    await waitModalGone(300);
    const stationNames = await waitTrainTimeStations(timeBtn);
    if (stationNames.length < 2) return;

    const segment = getTrainRowSegment(clickedRow) || { dep, arr };
    const segmentDep = segment.dep || dep;
    const segmentArr = segment.arr || arr;

    drawTrainStations(dep, arr, [{
      fullStations: stationNames,
      activeStations: sliceTrainStations(stationNames, segmentDep, segmentArr),
    }]);
  } finally {
    isFetchingTrainStations = false;
  }
}

async function fetchTrainStations(dep, arr, clickedRow) {
  console.warn("[Korail] fetchTrainStations called", dep, arr);
  const rows = clickedRow ? getConnectedTrainRows(clickedRow) : [{ row: null, segment: { dep, arr } }];
  const stationGroups = [];

  isFetchingTrainStations = true;
  try {
    for (const item of rows) {
      await waitModalGone(1000);

      const timeBtn = await getTrainTimeButton(item.row, item.segmentIndex);
      console.warn("[Korail] timeBtn:", timeBtn?.textContent?.trim(), timeBtn);
      const stationNames = await waitTrainTimeStations(timeBtn);
      console.warn("[Korail] stationNames:", stationNames);

      await waitModalGone(800);

      // const fareBtn = await getTrainFareButton(item.row);
      // const fareTextPromise = waitTrainFareTexts(fareBtn);

      const segmentDep = item.segment?.dep || dep;
      const segmentArr = item.segment?.arr || arr;
      const fullStations = stationNames.length >= 2
        ? stationNames
        : getFallbackRouteStations(segmentDep, segmentArr);
      const activeStations = stationNames.length >= 2
        ? sliceTrainStations(stationNames, segmentDep, segmentArr)
        : getFallbackSegmentStations(segmentDep, segmentArr);

      stationGroups.push({ fullStations, activeStations });

      // const resolvedFareTexts = await fareTextPromise;
      // updateTrainFareDisplay(item.row, resolvedFareTexts);

      await waitModalGone(500);
    }

    if (stationGroups.some((g) => (g.activeStations?.length ?? 0) >= 2)) {
      drawTrainStations(dep, arr, stationGroups);
    }
  } finally {
    isFetchingTrainStations = false;
  }
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

  const currentDep = getCurrentStationKey("dep");
  const currentArr = getCurrentStationKey("arr");

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
