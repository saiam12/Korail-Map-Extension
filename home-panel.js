// 홈 화면 가까운 주요역 패널 기능입니다.

waitForL(() => {
  const {
    HOME_PANEL_ID,
    QUICK_MENU_TEXTS,
    t,
    stationName,
    getKorailLocale,
    isVisibleFullMenuOpen,
  } = window.KORAIL_SHARED;
  const nearestSearchCache = new Map();
  const nearestSearchCacheCalculatedAt = new Map();
  const nearestSearchOrigins = new Map();
  const pendingNearestSearches = new Map();
  const nearestSearchTimestamps = [];
  const nearestCacheTtlMs = 24 * 60 * 60 * 1000;
  const nearestSearchWindowMs = 60 * 1000;
  const nearestSearchLimit = 5;
  let homePanelLayoutCleanup = () => {};

  function clearHomePanelLayoutTracking() {
    const cleanupLayout = homePanelLayoutCleanup;
    homePanelLayoutCleanup = () => {};
    cleanupLayout();
  }

  // 예매 결과 지도 래퍼와 패널을 원래 DOM 상태로 정리합니다.

  function cleanup() {
    // 열차 목록이 사라지면 지도 패널도 정리
    const panel = document.getElementById("korail-map-panel");
    if (window._korailMapInstance) {
      try {
        window._korailMapInstance.remove();
      } catch (error) {
        console.warn("[Korail Map] Failed to dispose route map:", error);
      } finally {
        window._korailMapInstance = null;
      }
    }

    const wrapper = document.getElementById("korail-map-wrapper");
    if (wrapper) {
      const trainTable = wrapper._korailTrainTable || wrapper.firstElementChild;
      if (trainTable && trainTable !== panel && wrapper.contains(trainTable) && wrapper.parentNode) {
        wrapper.parentNode.insertBefore(trainTable, wrapper);
      }
      wrapper.remove();
    }
    if (panel?.isConnected) panel.remove();
  }

  // 홈 화면 가까운 역 패널과 버튼을 제거합니다.

  function cleanupHomeNearestPanel() {
    clearHomePanelLayoutTracking();
    const panel = document.getElementById(HOME_PANEL_ID);
    if (panel) panel.remove();
    document.getElementById("korail-nearest-mini-btn")?.remove();
    document.getElementById("korail-intro-toggle-btn")?.remove();
    document.getElementById("korail-main-toggle-btn")?.remove();
    document.getElementById("korail-main-toggle-host")?.remove();
    setHomeSidePanelShift(false);
  }

  // 현재 화면이 로그인 페이지인지 판별합니다.

  function isLoginPage() {
    const path = location.pathname.toLowerCase();
    if (path.includes("login")) return true;
    return !!document.querySelector('input[type="password"]')
      && [...document.querySelectorAll("button, a, input")]
        .some((el) => ((el.textContent || el.value || "").trim() === "로그인"));
  }

  function isNearestPanelPage() {
    const path = location.pathname.replace(/\/+$/, "");
    return path === "/ticket/main" || path.includes("/intro");
  }

  // 예매 옵션 팝업이 열려 있는지 확인합니다.

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

    return [...document.querySelectorAll("div, section, article, h1, h2, h3, strong, p, span")]
      .some((el) => {
        const text = (el.textContent || "").trim();
        if (text !== "날짜 선택" && text !== "인원 선택") return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
  }

  function isAdBannerPopupOpen() {
    const visibleTexts = [...document.querySelectorAll("button, a, label, span, p, strong")]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      })
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase());

    const hasDismissControl = visibleTexts.some((text) =>
      text.includes("1일간 그만보기")
      || text.includes("오늘 하루 보지 않기")
      || text.includes("하루 동안 보지 않기")
      || text.includes("don't show again today")
      || text.includes("do not show again today")
    );
    const hasAdButtons = visibleTexts.some((text) => text === "view details")
      && visibleTexts.some((text) => text === "창닫기" || text === "close");
    return hasDismissControl || hasAdButtons;
  }

  function isVisibleKorailModalOpen() {
    const selector = [
      ".ReactModal__Content",
      ".layerPopup",
      ".layerWrap",
      ".layer_wrap",
      "[role='dialog']",
      "[aria-modal='true']",
    ].join(", ");
    return [...document.querySelectorAll(selector)].some((el) => {
      if (el.matches(".event-pop") || el.closest(".event-pop")) return false;
      if (el.closest(`#${HOME_PANEL_ID}, #korail-support-modal, #korail-station-map-popup`)) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const isSemanticDialog = el.matches("[role='dialog'], [aria-modal='true']");
      const isPositionedOverlay = style.position === "fixed" || style.position === "absolute";
      return rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity || "1") > 0
        && (isSemanticDialog || isPositionedOverlay)
        && el.getAttribute("aria-hidden") !== "true";
    });
  }

  function isNearestBlockingPopupOpen() {
    return isBookingOptionPopupOpen()
      || isAdBannerPopupOpen()
      || isVisibleFullMenuOpen()
      || isVisibleKorailModalOpen();
  }

  function isKoreanLocale() {
    return getKorailLocale() === "ko";
  }

  function getRequestLanguage() {
    return ({
      ko: "ko",
      en: "en",
      jpn: "ja",
      chn: "zh-CN",
      tw: "zh-TW",
    })[getKorailLocale()] || "en";
  }

  // 가까운 역 버튼의 비활성 상태를 현재 화면에 맞게 갱신합니다.

  function updateNearestDisabledState() {
    const disabled = isNearestBlockingPopupOpen();
    [
      document.getElementById(HOME_PANEL_ID),
      document.getElementById("korail-nearest-mini-btn"),
      document.getElementById("korail-intro-toggle-btn"),
      document.getElementById("korail-main-toggle-btn"),
      document.getElementById("korail-main-toggle-host"),
    ].forEach((el) => {
      if (!el) return;
      el.classList.toggle("is-korail-muted", disabled);
      if (el.matches("button")) el.disabled = disabled;
    });
  }

  let homeQuickMenuElements = null;

  function collectHomeQuickMenuElements() {
    const normalize = (text) => text.replace(/\s+/g, "");
    const labels = QUICK_MENU_TEXTS.map(normalize);
    const textNodes = [...document.querySelectorAll("a, button, li, span, p, strong, em")];

    homeQuickMenuElements = labels
      .map((label) => textNodes
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0
            && rect.height > 0
            && normalize(el.textContent || "").includes(label);
        })
        .sort((a, b) => {
          const aLength = normalize(a.textContent || "").length;
          const bLength = normalize(b.textContent || "").length;
          return aLength - bLength;
        })[0])
      .filter(Boolean);
  }

  function findHomeQuickMenu() {
    if (homeQuickMenuElements === null
      || !homeQuickMenuElements.every((element) => element.isConnected)) {
      collectHomeQuickMenuElements();
    }
    const matched = homeQuickMenuElements;

    if (matched.length < 3) return null;

    const rects = matched.map((el) => el.getBoundingClientRect());
    if (rects.some((rect) => rect.width <= 0 || rect.height <= 0)) {
      homeQuickMenuElements = null;
      return null;
    }
    const paddingX = window.innerWidth * 0.012;
    const paddingY = window.innerHeight * 0.018;
    const left = Math.min(...rects.map((rect) => rect.left)) - paddingX;
    const top = Math.min(...rects.map((rect) => rect.top)) - paddingY;
    const right = Math.max(...rects.map((rect) => rect.right)) + paddingX;
    const bottom = Math.max(...rects.map((rect) => rect.bottom)) + paddingY;

    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  let homePanelMiniOpen = false;
  // 홈 화면 우측 패널 요소를 찾습니다.
  function getHomeSidePanel() {
    return document.querySelector("div.ticket_box");
  }

  // 홈 화면 우측 패널 내부의 주요 항목들을 수집합니다.

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

  // 홈 화면 우측 패널을 필요한 만큼 아래로 이동시킵니다.

  function setHomeSidePanelShift(offset = 0) {
    getHomeSidePanelItems().forEach((el) => {
      el.style.transform = offset > 0 ? `translateX(${offset}px)` : "";
      el.style.transition = offset > 0 ? "transform 0.18s ease" : "";
    });
  }

  // 좁은 화면에서 홈 패널 배치 기준 영역을 계산합니다.


  // 좁은 화면용 가까운 역 패널 위치를 지정합니다.


  // 홈 화면 가까운 역 패널의 위치와 크기를 배치합니다.

  function positionHomeNearestPanel(panel) {
    if (location.pathname.includes("/intro")) return;
    const fullMenuOpen = isVisibleFullMenuOpen();
    if (fullMenuOpen && panel.style.left && panel.style.top) {
      updateNearestDisabledState();
      return;
    }
    const rect = (fullMenuOpen ? null : findHomeQuickMenu())
      || getHomeSidePanel()?.getBoundingClientRect();
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

    // 공간이 충분한지 확인
    const hasRightSpace = baseRect.right + gap + panelWidth <= viewportWidth - marginX;
    //const hasLeftSpace = baseRect.left - panelWidth - gap >= marginX;

    if (viewportWidth <= 640 || !hasRightSpace) {
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
    panel.style.height = "";
    panel.style.maxHeight = "";
    panel.style.overflow = "visible";
  }

  // 미니 버튼 옆에 가까운 역 패널을 배치합니다.

  function positionMiniPanel(panel, btn) {
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

  function positionIntroNearestPanel(panel) {
    if (!panel || panel.style.display === "none") return;

    const toggleBtn = document.getElementById("korail-intro-toggle-btn")
      || document.getElementById("korail-main-toggle-btn");
    if (!toggleBtn) return;

    const margin = 10;
    const gap = 14;
    const btnRect = toggleBtn.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 340;
    const panelHeight = Math.min(panel.offsetHeight || 400, window.innerHeight - margin * 2);
    const isMainToggle = toggleBtn.id === "korail-main-toggle-btn";
    if (isMainToggle) {
      const verticalGap = 12;
      const desiredLeft = btnRect.right - panelWidth;
      const leftPos = Math.min(
        Math.max(margin, desiredLeft),
        Math.max(margin, window.innerWidth - panelWidth - margin),
      );
      const desiredTop = btnRect.top - panelHeight - verticalGap;
      const topPos = Math.max(margin, desiredTop);

      panel.style.position = "absolute";
      panel.style.top = `${topPos + window.scrollY}px`;
      panel.style.left = `${leftPos + window.scrollX}px`;
      panel.style.maxHeight = `${window.innerHeight - margin * 2}px`;
      panel.style.overflowY = "auto";
      panel.style.overflowX = "hidden";
      return;
    }
    const hasRightSpace = btnRect.right + gap + panelWidth <= window.innerWidth - margin;
    const desiredLeft = hasRightSpace
      ? btnRect.right + gap
      : btnRect.left - panelWidth - gap;
    const leftPos = Math.min(
      Math.max(margin, desiredLeft),
      Math.max(margin, window.innerWidth - panelWidth - margin),
    );
    const desiredTop = btnRect.bottom - panelHeight;
    const topPos = Math.min(
      Math.max(margin, desiredTop),
      Math.max(margin, window.innerHeight - panelHeight - margin),
    );

    panel.style.position = "fixed";
    panel.style.top = `${topPos}px`;
    panel.style.left = `${leftPos}px`;
    panel.style.maxHeight = `${window.innerHeight - margin * 2}px`;
    panel.style.overflowY = "auto";
    panel.style.overflowX = "hidden";
  }

  // 가까운 역 미니 버튼에 표시할 문구를 반환합니다.

  function nearestToggleText(isOpen) {
    return isOpen ? `✕ ${t("close")}` : `🚉 ${t("nearestTitle")}`;
  }

  // 가까운 역 패널을 여는 미니 버튼을 표시합니다.

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
    
  // 가까운 역 미니 버튼을 숨깁니다.
    
  function hideMiniButton() {
    const btn = document.getElementById("korail-nearest-mini-btn");
    if (btn) btn.style.display = "none";
  } 

  // 지도 API 설정 값을 읽습니다.

  // HTML 삽입 전에 특수 문자를 이스케이프합니다.

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // API 오류 메시지를 포맷합니다.

  function buildMapsApiError(message) {
    return message || "API 요청에 실패했습니다.";
  }

  // content script를 통해 백그라운드에 지도 API 요청을 보냅니다.

  function requestMapsApi(kind, payload) {
    return new Promise((resolve, reject) => {
      const requestId = `korail-map-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        reject(new Error("지도 API 응답 시간이 초과되었습니다."));
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
          const error = new Error(response.status === 429
            ? (getKorailLocale() === "ko" ? "API 요청이 너무 많습니다. 1분 후 다시 시도해주세요." : "Too many API requests. Try again in one minute.")
            : buildMapsApiError(response.error || "지도 API 요청에 실패했습니다."));
          error.status = response.status;
          reject(error);
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

  function requestNearestCache(action, key = "", entry = null) {
    return new Promise((resolve, reject) => {
      const requestId = `nearest-cache-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const timeoutId = setTimeout(() => {
        window.removeEventListener("message", handleResponse);
        reject(new Error("Nearest cache timed out."));
      }, 3000);

      function handleResponse(event) {
        if (event.source !== window
          || event.data?.type !== "KORAIL_NEAREST_CACHE_RESPONSE"
          || event.data.requestId !== requestId) return;
        clearTimeout(timeoutId);
        window.removeEventListener("message", handleResponse);
        if (event.data.ok) resolve(event.data.entry || null);
        else reject(new Error(event.data.error || "Nearest cache failed."));
      }

      window.addEventListener("message", handleResponse);
      window.postMessage({ type: "KORAIL_NEAREST_CACHE_REQUEST", requestId, action, key, entry }, "*");
    });
  }

  function consumeNearestSearchQuota() {
    const now = Date.now();
    while (nearestSearchTimestamps.length && now - nearestSearchTimestamps[0] >= nearestSearchWindowMs) {
      nearestSearchTimestamps.shift();
    }
    if (nearestSearchTimestamps.length >= nearestSearchLimit) {
      const waitSeconds = Math.max(1, Math.ceil((nearestSearchWindowMs - (now - nearestSearchTimestamps[0])) / 1000));
      throw new Error(getKorailLocale() === "ko"
        ? `검색 요청이 너무 많습니다. ${waitSeconds}초 후 다시 시도해주세요.`
        : `Too many searches. Try again in ${waitSeconds} seconds.`);
    }
    nearestSearchTimestamps.push(now);
  }

  async function clearNearestSearchCache() {
    nearestSearchCache.clear();
    nearestSearchCacheCalculatedAt.clear();
    nearestSearchOrigins.clear();
    await requestNearestCache("clear");
  }

  // 검색 대상 역 목록을 좌표와 함께 반환합니다.

  function getSearchStations(includeAllStations = false) {
    return Object.entries(STATIONS)
      .filter(([, coords]) => includeAllStations || coords.major === true)
      .filter(([, coords]) => Number.isFinite(coords.lat) && Number.isFinite(coords.lng))
      .map(([name, coords]) => ({ name, lat: coords.lat, lng: coords.lng }));
  }

  // 두 좌표 사이의 직선 거리를 미터로 계산합니다.

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

  // 거리 값을 화면 표시용 문자열로 변환합니다.

  function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  }

  // 초 단위 시간을 시간/분 문자열로 변환합니다.

  function formatDuration(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return isKoreanLocale() ? `${minutes}분` : `${minutes} ${t("minute")}`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (!isKoreanLocale()) return remain ? `${hours} ${t("hour")} ${remain} ${t("minute")}` : `${hours} ${t("hour")}`;
    return remain ? `${hours}시간 ${remain}분` : `${hours}시간`;
  }

  // 가까운 역 검색 결과 영역을 렌더링합니다.

  function renderNearestResults(panel, state, message, stations = []) {
    const result = panel.querySelector("[data-nearest-result]");
    if (!result) return;
    result.dataset.state = state;

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
      if (panel.id === HOME_PANEL_ID) positionIntroNearestPanel(panel);
      return;
    }

    const showMajorBadges = panel.querySelector("[data-nearest-include-all]")?.checked === true;
    const sortMode = normalizeNearestSortMode(panel.querySelector("[data-nearest-sort-mode]")?.value);
    const sortLabel = sortMode === "transit" ? t("sortTransit") : t("sortDriving");
    const majorBadgeLabel = isKoreanLocale() ? "주요역" : "Major";
    const departureLabel = isKoreanLocale() ? "출발" : "Departure";
    const arrivalLabel = isKoreanLocale() ? "도착" : "Arrival";
    result.innerHTML = `
      <span class="korail-nearest-card__result-label">${escapeHtml(sortLabel)} · TOP ${stations.length}</span>
      <ol class="korail-nearest-list">
        ${stations.map((station, index) => `
          <li>
            <span class="korail-nearest-list__rank">${index + 1}</span>
            <span class="korail-nearest-list__name"><span class="korail-nearest-list__name-text">${escapeHtml(stationName(station.name))}</span>${showMajorBadges && STATIONS[station.name]?.major === true ? `<span class="korail-nearest-list__major">${majorBadgeLabel}</span>` : ""}<span class="korail-nearest-list__distance">📍${escapeHtml(station.distanceText)}</span></span>
            <span class="korail-nearest-list__meta">
              <span class="korail-nearest-list__times">🚗 ${station.durationText ? escapeHtml(station.durationText) : escapeHtml(t("unavailable"))}${station.transitDurationText ? " · 🚌 " + escapeHtml(station.transitDurationText) : ""}</span>
            </span>
            <span class="korail-nearest-list__actions">
              <button type="button" class="korail-nearest-list__station-button" data-nearest-station-select data-nearest-station-type="dep" data-nearest-station-name="${escapeHtml(stationName(station.name))}">${departureLabel}</button>
              <button type="button" class="korail-nearest-list__station-button" data-nearest-station-select data-nearest-station-type="arr" data-nearest-station-name="${escapeHtml(stationName(station.name))}">${arrivalLabel}</button>
            </span>
          </li>
        `).join("")}
      </ol>
    `;
    if (panel.id === HOME_PANEL_ID) positionIntroNearestPanel(panel);
  }

  // 주소를 좌표로 변환합니다.

  async function geocodeAddress(address) {
    const data = await requestMapsApi("locationGeocode", { address });
    if (!data[0]) throw new Error(t("geocodeNotFound"));
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }

  function requestCurrentLocation() {
    const requestId = `korail-location-${Date.now()}-${Math.random()}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", handler);
        reject(new Error("Location request timed out."));
      }, 12000);
      const handler = (event) => {
        if (event.source !== window || event.data?.type !== "KORAIL_CURRENT_LOCATION_RESPONSE" || event.data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", handler);
        event.data.ok ? resolve(event.data.data) : reject(new Error(event.data.error || "Location request failed."));
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "KORAIL_CURRENT_LOCATION_REQUEST", requestId }, "*");
    });
  }

  async function reverseGeocodeLocation({ lat, lng }) {
    const data = await requestMapsApi("locationReverse", {
      lat,
      lng,
      language: isKoreanLocale() ? "kor" : "eng",
    });
    if (!data.display_name) throw new Error(t("geocodeNotFound"));
    return data.display_name;
  }

  async function getCurrentLocationAddress() {
    return reverseGeocodeLocation(await requestCurrentLocation());
  }

  async function fillCurrentLocation(panel) {
    const input = panel.querySelector("[data-nearest-address]");
    const button = panel.querySelector("[data-nearest-current-location]");
    if (!input || !button
      || panel.dataset.nearestSearchBusy === "true"
      || panel.dataset.nearestLocationBusy === "true") return;

    panel.dataset.nearestLocationBusy = "true";
    const lockedControls = Array.from(panel.querySelectorAll([
      "[data-nearest-address]",
      "[data-nearest-submit]",
      "[data-nearest-include-all]",
      "[data-nearest-sort-mode]",
      "[data-nearest-current-location]",
      "[data-nearest-history-toggle]",
    ].join(",")));
    const previousDisabledStates = lockedControls.map((control) => control.disabled);
    lockedControls.forEach((control) => { control.disabled = true; });
    button.querySelector("[data-nearest-location-label]").textContent = t("locating");
    let shouldFocusInput = false;
    try {
      const address = await getCurrentLocationAddress();
      input.value = address;
      shouldFocusInput = true;
    } catch (error) {
      renderNearestResults(panel, "error", t("locationUnavailable"));
    } finally {
      delete panel.dataset.nearestLocationBusy;
      lockedControls.forEach((control, index) => {
        control.disabled = previousDisabledStates[index];
      });
      button.querySelector("[data-nearest-location-label]").textContent = t("useCurrentLocation");
      (shouldFocusInput ? input : button).focus();
    }
  }

  // 현재 위치에서 가까운 주요 역을 거리순으로 고릅니다.

  function getNearestByDistance(origin, limit = 3, includeAllStations = false) {
    return getSearchStations(includeAllStations)
      .map((station) => {
        const distanceMeters = getDistanceMeters(origin, station);
        return {
          ...station,
          straightDistanceMeters: distanceMeters,
          distanceMeters,
          distanceText: formatDistance(distanceMeters),
        };
      })
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, limit);
  }

  function formatCachedNearestResults(results) {
    return results.map((station) => ({
      ...station,
      durationText: Number.isFinite(station.durationSeconds)
        ? formatDuration(station.durationSeconds)
        : "",
      transitDurationText: Number.isFinite(station.transitDurationSeconds)
        ? formatDuration(station.transitDurationSeconds)
        : "",
      distanceText: Number.isFinite(station.distanceMeters)
        ? formatDistance(station.distanceMeters)
        : "",
    }));
  }

  // 현재 위치에서 각 역까지의 자동차 길찾기 요약 정보를 조회합니다.

  function hasResolvedDrivingRoute(station) {
    return station.drivingAvailable === false
      || (station.drivingAvailable === true
        && Number.isFinite(station.durationSeconds)
        && station.durationSeconds > 0);
  }

  async function addDrivingRouteInfo(origin, stations) {
    const results = stations.slice();

    for (const [index, station] of stations.entries()) {
      if (hasResolvedDrivingRoute(station)) continue;
      const payload = {
        startLat: origin.lat,
        startLng: origin.lng,
        goalLat: station.lat,
        goalLng: station.lng,
      };
      try {
        const drivingData = await requestMapsApi("driving", payload);
        const drivingSummary = drivingData.route?.trafast?.[0]?.summary;
        if (!drivingSummary) {
          const responseCode = Number(drivingData.code);
          if (drivingData.available === false
            || (Number.isInteger(responseCode) && responseCode >= 1 && responseCode <= 5)) {
            results[index] = { ...station, drivingAvailable: false };
          }
          continue;
        }
        results[index] = {
          ...station,
          drivingAvailable: true,
          durationSeconds: drivingSummary.duration / 1000,
          durationText: formatDuration(drivingSummary.duration / 1000),
          distanceText: formatDistance(drivingSummary.distance),
          distanceMeters: drivingSummary.distance,
        };
      } catch (error) {
        console.warn("[Korail] Naver driving request failed:", station.name, error);
        if (error?.status === 429) {
          error.partialResults = results;
          throw error;
        }
      }
    }
    return results;
  }

  // 화면에 표시할 역에만 대중교통 시간을 추가합니다.

  function hasResolvedTransitRoute(station) {
    return station.transitAvailable === false
      || (station.transitAvailable === true
        && Number.isFinite(station.transitDurationSeconds)
        && station.transitDurationSeconds > 0);
  }

  async function addTransitRouteInfo(origin, stations) {
    const pendingStations = stations
      .map((station, index) => ({ station, index }))
      .filter(({ station }) => !hasResolvedTransitRoute(station));
    if (!pendingStations.length) return stations;

    const settled = await Promise.allSettled(pendingStations.map(({ station }) => requestMapsApi("transit", {
      startLat: origin.lat,
      startLng: origin.lng,
      goalLat: station.lat,
      goalLng: station.lng,
    })));
    const results = stations.slice();

    pendingStations.forEach(({ station, index }, pendingIndex) => {
      const transitResult = settled[pendingIndex];
      if (transitResult.status === "rejected") {
        console.warn("[Korail] Kakao transit request failed:", station.name, transitResult.reason);
        return;
      }
      if (transitResult.value?.available === false) {
        results[index] = { ...station, transitAvailable: false };
        return;
      }
      const transitDurationSeconds = Number(transitResult.value?.durationSeconds);
      if (!Number.isFinite(transitDurationSeconds) || transitDurationSeconds <= 0) return;
      results[index] = {
        ...station,
        transitAvailable: true,
        transitDurationSeconds,
        transitDurationText: formatDuration(transitDurationSeconds),
      };
    });
    return results;
  }

  function normalizeNearestSortMode(sortMode) {
    return sortMode === "transit" ? "transit" : "driving";
  }

  function compareOptionalDuration(left, right) {
    const leftValue = Number.isFinite(left) ? left : Infinity;
    const rightValue = Number.isFinite(right) ? right : Infinity;
    if (leftValue === rightValue) return 0;
    return leftValue - rightValue;
  }

  function sortNearestResults(stations, sortMode) {
    const normalizedSortMode = normalizeNearestSortMode(sortMode);
    return stations.slice().sort((left, right) => {
      const primary = normalizedSortMode === "transit"
        ? compareOptionalDuration(left.transitDurationSeconds, right.transitDurationSeconds)
        : compareOptionalDuration(left.durationSeconds, right.durationSeconds);
      if (primary) return primary;
      const driving = compareOptionalDuration(left.durationSeconds, right.durationSeconds);
      if (driving) return driving;
      const distance = compareOptionalDuration(left.straightDistanceMeters, right.straightDistanceMeters);
      if (distance) return distance;
      return String(left.name).localeCompare(String(right.name), "ko");
    });
  }

  function mergeNearestRouteResults(stations, updates) {
    const updatesByName = new Map(updates.map((station) => [station.name, station]));
    return stations.map((station) => updatesByName.get(station.name) || station);
  }

  async function prepareNearestResults(origin, stations, sortMode, resultLimit) {
    const normalizedSortMode = normalizeNearestSortMode(sortMode);
    let allResults;
    try {
      allResults = await addDrivingRouteInfo(origin, stations);
    } catch (error) {
      return {
        allResults: Array.isArray(error?.partialResults) ? error.partialResults : stations,
        visibleResults: [],
        error,
      };
    }
    let preparationError = null;
    if (normalizedSortMode === "transit") {
      allResults = await addTransitRouteInfo(origin, allResults);
      if (allResults.some((station) => !hasResolvedTransitRoute(station))) {
        preparationError = new Error(t("transitUnavailable"));
      } else if (!allResults.some((station) => Number.isFinite(station.transitDurationSeconds))) {
        preparationError = new Error(t("transitUnavailable"));
      }
    } else {
      if (allResults.some((station) => !hasResolvedDrivingRoute(station))) {
        preparationError = new Error(t("drivingUnavailable"));
      }
      const drivingTop = sortNearestResults(allResults, "driving")
        .filter((station) => Number.isFinite(station.durationSeconds))
        .slice(0, resultLimit);
      if (!drivingTop.length) preparationError = new Error(t("drivingUnavailable"));
      if (!preparationError) {
        const drivingTopWithTransit = await addTransitRouteInfo(origin, drivingTop);
        allResults = mergeNearestRouteResults(allResults, drivingTopWithTransit);
      }
    }
    const visibleResults = sortNearestResults(allResults, normalizedSortMode)
      .filter((station) => normalizedSortMode === "transit"
        ? Number.isFinite(station.transitDurationSeconds)
        : Number.isFinite(station.durationSeconds))
      .slice(0, resultLimit);
    return {
      allResults,
      visibleResults,
      error: preparationError,
    };
  }

  // 입력 주소 기준 가까운 주요 역 검색을 실행합니다.

  async function findNearestStationResults(address, includeAllStations = false, sortMode = "driving") {
    const normalizedAddress = String(address || "").trim().replace(/([가-힣])\s+(\d+(길|로|가))/g, "$1$2");
    if (!normalizedAddress) throw new Error(t("enterAddressError"));

    const normalizedSortMode = normalizeNearestSortMode(sortMode);
    const candidateLimit = includeAllStations ? 8 : 5;
    const resultLimit = includeAllStations ? 5 : 3;
    const cacheKey = getNearestSearchCacheKey(normalizedAddress, includeAllStations);
    if (pendingNearestSearches.has(cacheKey)) {
      const pendingSearch = pendingNearestSearches.get(cacheKey);
      try {
        await pendingSearch;
      } catch {
        // The pending request may use another sort mode. Re-enter with its partial cache.
      }
      if (pendingNearestSearches.get(cacheKey) === pendingSearch) pendingNearestSearches.delete(cacheKey);
      return findNearestStationResults(normalizedAddress, includeAllStations, normalizedSortMode);
    }

    const search = (async () => {
      const cachedResults = nearestSearchCache.get(cacheKey);
      const cachedCalculatedAt = nearestSearchCacheCalculatedAt.get(cacheKey);
      const cachedOrigin = nearestSearchOrigins.get(cacheKey);
      if (cachedResults
        && Number.isFinite(cachedCalculatedAt)
        && cachedCalculatedAt <= Date.now()
        && Date.now() - cachedCalculatedAt <= nearestCacheTtlMs
        && Number.isFinite(cachedOrigin?.lat)
        && Number.isFinite(cachedOrigin?.lng)) {
        const origin = cachedOrigin;
        const prepared = await prepareNearestResults(origin, cachedResults, normalizedSortMode, resultLimit);
        nearestSearchCache.set(cacheKey, prepared.allResults);
        nearestSearchCacheCalculatedAt.set(cacheKey, cachedCalculatedAt);
        await requestNearestCache("set", cacheKey, {
          savedAt: Date.now(),
          calculatedAt: cachedCalculatedAt,
          address: normalizedAddress,
          includeAllStations,
          sortMode: normalizedSortMode,
          origin,
          results: prepared.allResults,
        }).catch(() => null);
        if (prepared.error) throw prepared.error;
        return prepared.visibleResults;
      }
      nearestSearchCache.delete(cacheKey);
      nearestSearchCacheCalculatedAt.delete(cacheKey);
      nearestSearchOrigins.delete(cacheKey);

      const stored = await requestNearestCache("get", cacheKey).catch(() => null);
      const storedCalculatedAt = Number.isFinite(stored?.calculatedAt) ? stored.calculatedAt : stored?.savedAt;
      const storedOrigin = Number.isFinite(stored?.origin?.lat) && Number.isFinite(stored?.origin?.lng)
        ? stored.origin
        : null;
      if (stored
        && Number.isFinite(storedCalculatedAt)
        && storedCalculatedAt <= Date.now()
        && Date.now() - storedCalculatedAt <= nearestCacheTtlMs
        && Array.isArray(stored.results)
        && storedOrigin) {
        const storedResults = formatCachedNearestResults(stored.results);
        const origin = storedOrigin;
        const prepared = await prepareNearestResults(origin, storedResults, normalizedSortMode, resultLimit);
        nearestSearchCache.set(cacheKey, prepared.allResults);
        nearestSearchCacheCalculatedAt.set(cacheKey, storedCalculatedAt);
        nearestSearchOrigins.set(cacheKey, origin);
        await requestNearestCache("set", cacheKey, {
          savedAt: Date.now(),
          calculatedAt: storedCalculatedAt,
          address: normalizedAddress,
          includeAllStations,
          sortMode: normalizedSortMode,
          origin,
          results: prepared.allResults,
        }).catch(() => null);
        if (prepared.error) throw prepared.error;
        return prepared.visibleResults;
      }

      consumeNearestSearchQuota();
      const origin = await geocodeAddress(normalizedAddress);
      const candidateStations = getNearestByDistance(origin, candidateLimit, includeAllStations);
      const prepared = await prepareNearestResults(origin, candidateStations, normalizedSortMode, resultLimit);
      const savedResults = prepared.allResults.map((station) => ({ ...station }));
      const calculatedAt = Date.now();
      nearestSearchCache.set(cacheKey, savedResults);
      nearestSearchCacheCalculatedAt.set(cacheKey, calculatedAt);
      nearestSearchOrigins.set(cacheKey, origin);
      await requestNearestCache("set", cacheKey, {
        savedAt: Date.now(),
        calculatedAt,
        address: normalizedAddress,
        includeAllStations,
        sortMode: normalizedSortMode,
        origin,
        results: savedResults,
      }).catch(() => null);
      if (prepared.error) throw prepared.error;
      return prepared.visibleResults;
    })();

    pendingNearestSearches.set(cacheKey, search);
    try {
      return await search;
    } finally {
      if (pendingNearestSearches.get(cacheKey) === search) pendingNearestSearches.delete(cacheKey);
    }
  }

  async function searchNearestStations(panel) {
    const input = panel.querySelector("[data-nearest-address]");
    const submit = panel.querySelector("[data-nearest-submit], button[type='submit']");
    const sortSelect = panel.querySelector("[data-nearest-sort-mode]");
    if (panel.dataset.nearestSearchBusy === "true" || panel.dataset.nearestLocationBusy === "true") return;
    panel.dataset.nearestSearchBusy = "true";
    const lockedControls = Array.from(panel.querySelectorAll([
      "[data-nearest-address]",
      "[data-nearest-include-all]",
      "[data-nearest-sort-mode]",
      "[data-nearest-current-location]",
      "[data-nearest-history-toggle]",
    ].join(",")));
    const previousDisabledStates = lockedControls.map((control) => control.disabled);
    lockedControls.forEach((control) => { control.disabled = true; });
    if (submit) submit.disabled = true;
    const sortMode = sortSelect?.value;
    const startedAt = Date.now();
    const minimumLoadingMs = 500 + Math.floor(Math.random() * 501);
    let shouldFocusEmptyAddress = false;
    try {
      renderNearestResults(panel, "loading", t("calculating"));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const includeAllStations = panel.querySelector("[data-nearest-include-all]")?.checked === true;
      const results = await findNearestStationResults(input?.value, includeAllStations, sortMode);
      const remainingLoadingMs = minimumLoadingMs - (Date.now() - startedAt);
      if (remainingLoadingMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, remainingLoadingMs));
      }
      renderNearestResults(panel, "done", t("nearestStations"), results);
    } catch (error) {
      renderNearestResults(panel, "error", error.message || t("searchError"));
      shouldFocusEmptyAddress = !input?.value.trim();
    } finally {
      delete panel.dataset.nearestSearchBusy;
      if (submit) submit.disabled = false;
      lockedControls.forEach((control, index) => {
        control.disabled = previousDisabledStates[index];
      });
      if (panel.dataset.nearestFocusSortAfterSearch === "true") {
        delete panel.dataset.nearestFocusSortAfterSearch;
        sortSelect?.focus();
      } else if (panel.dataset.nearestFocusAddressAfterSearch === "true") {
        delete panel.dataset.nearestFocusAddressAfterSearch;
        input?.focus();
      } else if (shouldFocusEmptyAddress) {
        input?.focus();
      }
    }
  }

  function getNearestSearchCacheKey(address, includeAllStations) {
    const normalizedAddress = address
      .replace(/\s+/g, "")
      .toLowerCase();
    return `${includeAllStations ? "all" : "major"}:${normalizedAddress}`;
  }

  function closeNearestHistory(panel) {
    const history = panel.querySelector("[data-nearest-history]");
    const toggle = panel.querySelector("[data-nearest-history-toggle]");
    if (history) history.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
  }

  function renderNearestHistory(panel, entries) {
    const history = panel.querySelector("[data-nearest-history]");
    if (!history) return;
    history.replaceChildren();

    if (!entries.length) {
      const empty = document.createElement("span");
      empty.className = "korail-nearest-history__empty";
      empty.textContent = getKorailLocale() === "ko" ? "최근 입력 기록이 없습니다." : "No recent searches.";
      history.appendChild(empty);
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement("div");
      item.className = "korail-nearest-history__item";

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "korail-nearest-history__remove";
      remove.dataset.historyRemove = entry.key;
      remove.setAttribute("aria-label", getKorailLocale() === "ko" ? `${entry.address} 기록 삭제` : `Remove ${entry.address} from history`);
      remove.textContent = "×";

      const select = document.createElement("button");
      select.type = "button";
      select.className = "korail-nearest-history__select";
      select.dataset.historySelect = "true";
      select.dataset.address = entry.address;
      select.dataset.includeAll = String(entry.includeAllStations);

      const address = document.createElement("span");
      address.className = "korail-nearest-history__address";
      address.textContent = entry.address;
      address.title = entry.address;

      const option = document.createElement("span");
      option.className = "korail-nearest-history__option";
      const stationScope = getKorailLocale() === "ko"
        ? (entry.includeAllStations ? "일반역 포함" : "주요역만")
        : (entry.includeAllStations ? "All stations" : "Major only");
      option.textContent = stationScope;

      select.append(address, option);
      item.append(remove, select);
      history.appendChild(item);
    });
  }

  async function toggleNearestHistory(panel) {
    const history = panel.querySelector("[data-nearest-history]");
    const toggle = panel.querySelector("[data-nearest-history-toggle]");
    if (!history || !toggle) return;
    if (!history.hidden) {
      closeNearestHistory(panel);
      return;
    }

    toggle.setAttribute("aria-expanded", "true");
    history.hidden = false;
    history.replaceChildren();
    const loading = document.createElement("span");
    loading.className = "korail-nearest-history__empty";
    loading.textContent = getKorailLocale() === "ko" ? "기록을 불러오는 중입니다." : "Loading history.";
    history.appendChild(loading);
    const entries = await requestNearestCache("list").catch(() => []);
    renderNearestHistory(panel, Array.isArray(entries) ? entries : []);
  }

  // 가까운 역 패널의 검색 이벤트를 연결합니다.

  function bindNearestHistory(panel) {
    if (panel.dataset.nearestHistoryBound === "true") return;
    panel.dataset.nearestHistoryBound = "true";
    panel.querySelector("[data-nearest-history-toggle]")?.addEventListener("click", () => toggleNearestHistory(panel));
    panel.querySelector("[data-nearest-history]")?.addEventListener("click", async (event) => {
      if (panel.dataset.nearestSearchBusy === "true" || panel.dataset.nearestLocationBusy === "true") return;
      const remove = event.target.closest("[data-history-remove]");
      if (remove) {
        remove.disabled = true;
        try {
          await requestNearestCache("hide", remove.dataset.historyRemove);
        } catch {
          remove.disabled = false;
          return;
        }
        remove.closest(".korail-nearest-history__item")?.remove();
        const history = panel.querySelector("[data-nearest-history]");
        if (history && !history.children.length) renderNearestHistory(panel, []);
        return;
      }

      const item = event.target.closest("[data-history-select]");
      if (!item) return;
      const input = panel.querySelector("[data-nearest-address]");
      const includeAll = panel.querySelector("[data-nearest-include-all]");
      if (input) input.value = item.dataset.address || "";
      if (includeAll) includeAll.checked = item.dataset.includeAll === "true";
      closeNearestHistory(panel);
      panel.dataset.nearestFocusAddressAfterSearch = "true";
      panel.querySelector("form")?.requestSubmit();
    });
  }

  function bindNearestStationActions(panel) {
    if (panel.dataset.nearestStationActionsBound === "true") return;
    panel.dataset.nearestStationActionsBound = "true";
    panel.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-nearest-station-select]");
      if (!button || !panel.contains(button)) return;

      button.disabled = true;
      try {
        await window.KORAIL_BOOKING?.chooseStationThroughPicker?.(
          button.dataset.nearestStationType,
          button.dataset.nearestStationName,
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  function bindHomeNearestPanel(panel) {
    const form = panel.querySelector("[data-nearest-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      searchNearestStations(panel);
    });
    panel.querySelector("[data-nearest-sort-mode]")?.addEventListener("change", () => {
      const result = panel.querySelector("[data-nearest-result]");
      const address = panel.querySelector("[data-nearest-address]")?.value.trim();
      if (["done", "error"].includes(result?.dataset.state) && address) {
        panel.dataset.nearestFocusSortAfterSearch = "true";
        form?.requestSubmit();
      }
    });
    panel.querySelector("[data-nearest-current-location]")?.addEventListener("click", () => fillCurrentLocation(panel));
    bindNearestHistory(panel);
    bindNearestStationActions(panel);
  }

  // 가까운 역 패널의 기본 HTML을 렌더링합니다.

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
          <div class="korail-nearest-search__label-row">
            <label class="korail-nearest-search__label" for="korail-nearest-address">${t("departureLocation")}</label>
            <button type="button" class="korail-nearest-history-button" data-nearest-history-toggle aria-expanded="false" aria-controls="korail-nearest-history"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg><span>${getKorailLocale() === "ko" ? "최근 기록" : "History"}</span></button>
          </div>
          <div id="korail-nearest-history" class="korail-nearest-history" data-nearest-history hidden></div>
          <div class="korail-nearest-search__row">
            <input id="korail-nearest-address" data-nearest-address type="text" placeholder="${t("addressPlaceholder")}" autocomplete="street-address">
            <button type="submit" class="korail-nearest-card__button" data-nearest-submit>${t("search")}</button>
          </div>
          <div class="korail-nearest-search__options">
            <label class="korail-nearest-search__toggle">
              <input data-nearest-include-all type="checkbox">
              <span class="korail-nearest-search__switch" aria-hidden="true"></span>
              <span>${t("includeAllStations")}</span>
            </label>
            <button type="button" class="korail-nearest-location-button" data-nearest-current-location><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg><span data-nearest-location-label>${t("useCurrentLocation")}</span></button>
            <label class="korail-nearest-sort">
              <span>${t("sortCriterion")}</span>
              <select data-nearest-sort-mode aria-label="${t("sortCriterion")}">
                <option value="driving">🚗 ${t("sortDriving")}</option>
                <option value="transit">🚌 ${t("sortTransit")}</option>
              </select>
            </label>
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

  // 홈 화면에 가까운 주요역 패널을 삽입합니다.

  function injectHomeNearestPanel() {
    if (isLoginPage() || !isNearestPanelPage()) {
      cleanupHomeNearestPanel();
      return;
    }

    const isIntroPage = location.pathname.includes("/intro");
    const existingPanel = document.getElementById(HOME_PANEL_ID);
    if (existingPanel) {
      if (!isIntroPage && existingPanel.dataset.korailIntroPanel === "true") {
        cleanupHomeNearestPanel();
        injectHomeNearestPanel();
        return;
      }
      if (existingPanel.dataset.korailLang !== getKorailLocale()) {
        renderHomeNearestPanel(existingPanel);
        bindHomeNearestPanel(existingPanel);
      }
      positionHomeNearestPanel(existingPanel);
      return;
    }
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

  async function findNearestStationMatch(address, includeAllStations = false, sortMode = "driving") {
    const normalizedAddress = String(address || "").trim().replace(/([가-힣])\s+(\d+(길|로|가))/g, "$1$2");
    const normalizedSortMode = normalizeNearestSortMode(sortMode);
    const stations = await findNearestStationResults(normalizedAddress, includeAllStations, normalizedSortMode);
    const cacheKey = getNearestSearchCacheKey(normalizedAddress, includeAllStations);
    let origin = nearestSearchOrigins.get(cacheKey);

    if (!origin) {
      origin = await geocodeAddress(normalizedAddress);
      nearestSearchOrigins.set(cacheKey, origin);
      await requestNearestCache("set", cacheKey, {
        savedAt: Date.now(),
        calculatedAt: nearestSearchCacheCalculatedAt.get(cacheKey) || Date.now(),
        address: normalizedAddress,
        includeAllStations,
        sortMode: normalizedSortMode,
        origin,
        results: nearestSearchCache.get(cacheKey) || stations,
      }).catch(() => null);
    }
    return { origin, stations };
  }

  // 인트로 화면의 가까운 역 패널을 삽입합니다.

  function injectIntroPanel(panel) {
    clearHomePanelLayoutTracking();
    panel.dataset.korailIntroPanel = "true";
    document.getElementById("korail-intro-toggle-btn")?.remove();
    const searchBtn = document.querySelector("button.search_btn");
    const searchSection = document.querySelector("section.search");
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
      const currentSearchBtn = document.querySelector("button.search_btn");
      if (!currentSearchBtn) return;
      const btnRect = currentSearchBtn.getBoundingClientRect();
      const sectionRect = searchSection.getBoundingClientRect();
      const toggleWidth = btnRect.width;
      const toggleHeight = 42;
      const top = sectionRect.bottom + 8;
      toggleBtn.style.cssText = `
        position: fixed;
        top: ${top}px;
        left: ${btnRect.left + btnRect.width / 2}px;
        transform: translateX(-50%);
        width: ${toggleWidth}px;
        min-height: ${toggleHeight}px;
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
    const handleIntroResize = () => {
      positionToggleBtn();
      positionIntroNearestPanel(panel);
    };
    window.addEventListener("resize", handleIntroResize);
    homePanelLayoutCleanup = () => {
      window.removeEventListener("resize", handleIntroResize);
    };

    toggleBtn.addEventListener("click", () => {
      const isOpen = panel.style.display !== "none";
      if (!isOpen) {
        panel.style.display = "";
        positionIntroNearestPanel(panel);
      } else {
        panel.style.display = "none";
      }
      toggleBtn.textContent = nearestToggleText(!isOpen);
      updateNearestDisabledState();
    });
  }

  window.injectHomeFeature = injectHomeNearestPanel;
  
  // 날짜/인원 선택 및 광고 팝업 열림·닫힘을 감지해 nearest 패널을 즉시 비활성화합니다.
    
    
  function setNearestPanelZIndex(behind) {
    [
      document.getElementById(HOME_PANEL_ID),
      document.getElementById("korail-nearest-mini-btn"),
      document.getElementById("korail-intro-toggle-btn"),
      document.getElementById("korail-main-toggle-btn"),
      document.getElementById("korail-main-toggle-host"),
    ].forEach((el) => {
      if (el) el.classList.toggle("is-korail-muted", behind);
    });
  }

  function isExtensionMapMutation(record) {
    const target = record?.target?.nodeType === 1
      ? record.target
      : record?.target?.parentElement;
    return !!target?.closest?.("#korail-map-panel, #korail-station-map-popup, .leaflet-container");
  }
  
  function observeBookingOptionPopup() {
    let wasOpen = null;
    let syncScheduled = false;
    const syncPopupState = () => {
      const isOpen = isNearestBlockingPopupOpen();
      if (isOpen === wasOpen) return;
      wasOpen = isOpen;
      setNearestPanelZIndex(isOpen);
      updateNearestDisabledState();
    };
    const observer = new MutationObserver((records) => {
      const hasRelevantMutation = records.some((record) => !isExtensionMapMutation(record));
      if (!hasRelevantMutation) return;
      homeQuickMenuElements = null;
      if (syncScheduled) return;
      syncScheduled = true;
      requestAnimationFrame(() => {
        syncScheduled = false;
        syncPopupState();
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-hidden", "hidden"],
    });
    syncPopupState();
  }
  
  observeBookingOptionPopup();

  window.KORAIL_HOME = {
    cleanup,
    cleanupHomeNearestPanel,
    isLoginPage,
    updateNearestDisabledState,
    positionHomeNearestPanel,
    injectHomeNearestPanel,
    findNearestStationResults,
    findNearestStationMatch,
    getNearestSearchHistory: () => requestNearestCache("list").catch(() => []),
    removeNearestSearchHistory: (key) => requestNearestCache("hide", key),
    getCurrentLocationAddress,
    renderNearestResults,
    bindNearestHistory,
    bindNearestStationActions,
    clearNearestSearchCache,
  };
}); // waitForL
