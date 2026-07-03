// 홈 화면 가까운 주요역 패널 기능입니다.

waitForL(() => {
  const { HOME_PANEL_ID, QUICK_MENU_TEXTS, t, stationName, getKorailLocale } = window.KORAIL_SHARED;
  const nearestSearchCache = new Map();

  // 예매 결과 지도 래퍼와 패널을 원래 DOM 상태로 정리합니다.

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

  // 홈 화면 가까운 역 패널과 버튼을 제거합니다.

  function cleanupHomeNearestPanel() {
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

  // 가까운 역 버튼의 비활성 상태를 현재 화면에 맞게 갱신합니다.

  function updateNearestDisabledState() {
    const disabled = isBookingOptionPopupOpen();
    [
      document.getElementById(HOME_PANEL_ID),
      document.getElementById("korail-nearest-mini-btn"),
      document.getElementById("korail-intro-toggle-btn"),
      document.getElementById("korail-main-toggle-btn"),
    ].forEach((el) => {
      if (el) el.classList.toggle("is-korail-muted", disabled);
    });
  }

  // 홈 화면 빠른 메뉴 영역의 위치 정보를 찾습니다.

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

  // 좁은 화면용 가까운 역 패널 위치를 지정합니다.

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

  // 홈 화면 가까운 역 패널의 위치와 크기를 배치합니다.

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

  // 미니 버튼 옆에 가까운 역 패널을 배치합니다.

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
      const desiredLeft = btnRect.right + gap;
      const leftPos = Math.min(
        Math.max(margin, desiredLeft),
        Math.max(margin, window.innerWidth - panelWidth - margin),
      );
      const desiredTop = btnRect.bottom - panelHeight;
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

  function findIntroSearchButton() {
    const candidates = [...document.querySelectorAll("button, a, input[type='button'], input[type='submit'], [role='button'], [onclick], .search_btn, div, span")]
      .map((el) => {
        if (el.id === "korail-intro-toggle-btn") return false;
        if (el.id === "korail-main-toggle-btn") return false;
        if (el.closest(`#${HOME_PANEL_ID}`)) return false;
        const control = el.closest("button, a, input, [role='button'], [onclick], .search_btn")
          || (el.matches("div, span") ? el.closest("div") : el);
        if (!control) return false;
        let searchControl = control;
        while (
          searchControl.parentElement
          && searchControl.parentElement.matches("div, span")
          && /\bSearch\b|열차조회/.test((searchControl.parentElement.textContent || "").replace(/\s+/g, " ").trim())
        ) {
          const parentRect = searchControl.parentElement.getBoundingClientRect();
          if (parentRect.width > 360 || parentRect.height > 90) break;
          searchControl = searchControl.parentElement;
        }
        const rect = searchControl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return false;
        if (rect.top < window.innerHeight * 0.35) return false;
        const text = [
          el.textContent,
          el.value,
          el.getAttribute("aria-label"),
          el.getAttribute("title"),
        ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        const className = typeof el.className === "string" ? el.className : "";
        const isExactSearchText = /^Search$/i.test(text);
        const isSearchText = /\bSearch\b/i.test(text);
        const isKorSearchText = text.includes("열차조회");
        const isSearchClass = el.matches(".search_btn") || /\b(search|btn_search|search_btn)\b/i.test(className);
        if (!isExactSearchText && !isSearchText && !isKorSearchText && !isSearchClass) return false;
        if (!isExactSearchText && !isKorSearchText && (rect.width > 360 || rect.height > 90)) return false;

        return {
          el: searchControl,
          rect,
          score: (isExactSearchText ? 100 : 0)
            + (isKorSearchText ? 100 : 0)
            + (isSearchText ? 40 : 0)
            + (isSearchClass ? 20 : 0)
            + (el.matches("[onclick]") ? 10 : 0)
            + (el.matches("button, input, [role='button']") ? 10 : 0),
        };
      })
      .filter(Boolean);

    return candidates
      .sort((a, b) => {
        return b.score - a.score
          || a.rect.width * a.rect.height - b.rect.width * b.rect.height;
      })[0]?.el || null;
  }

  function getVisibleMainRect(el, minTopRatio = 0.25) {
    if (!el || el.closest(`#${HOME_PANEL_ID}`)) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    if (rect.top < window.innerHeight * minTopRatio) return false;
    return rect;
  }

  function isVisibleMainAnchor(el, minTopRatio = 0.25) {
    return !!getVisibleMainRect(el, minTopRatio);
  }

  function getCommonAncestor(a, b) {
    let node = a?.parentElement || null;
    while (node && node !== document.body) {
      if (node.contains(b)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function findMainBookingControls() {
    const arrivals = [...document.querySelectorAll("a.btn_pop.btn_end, button.btn_pop.btn_end, .btn_pop.btn_end")]
      .map((el) => ({ el, rect: getVisibleMainRect(el, 0.25) }))
      .filter((item) => item.rect);
    const lookups = [...document.querySelectorAll("button.btn_lookup, a.btn_lookup, .btn_lookup")]
      .map((el) => ({ el, rect: getVisibleMainRect(el, 0.25) }))
      .filter((item) => item.rect);

    const pairs = [];
    arrivals.forEach((arrival) => {
      lookups.forEach((lookup) => {
        const area = getCommonAncestor(arrival.el, lookup.el);
        if (!area) return;
        const areaRect = area.getBoundingClientRect();
        if (areaRect.width <= 0 || areaRect.height <= 0) return;

        const arrivalCenterY = arrival.rect.top + arrival.rect.height / 2;
        const lookupCenterY = lookup.rect.top + lookup.rect.height / 2;
        const lookupBelowArrival = lookupCenterY >= arrivalCenterY;
        const sameSearchBand = Math.abs(lookupCenterY - arrivalCenterY) < Math.max(180, areaRect.height);
        if (!lookupBelowArrival || !sameSearchBand) return;

        pairs.push({
          arrival: arrival.el,
          lookup: lookup.el,
          area,
          score: areaRect.width * areaRect.height
            + Math.abs(lookupCenterY - arrivalCenterY) * 40
            + Math.abs((lookup.rect.left + lookup.rect.right) / 2 - (arrival.rect.left + arrival.rect.right) / 2),
        });
      });
    });

    return pairs.sort((a, b) => a.score - b.score)[0] || null;
  }

  function findMainSearchArea() {
    return findMainBookingControls()?.area || null;
  }

  function findMainArrivalButton() {
    return findMainBookingControls()?.arrival || null;
  }

  function findMainLookupButton() {
    return findMainBookingControls()?.lookup || null;
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
    
  // 가까운 역 미니 버튼을 숨깁니다.
    
  function hideMiniButton() {
    const btn = document.getElementById("korail-nearest-mini-btn");
    if (btn) btn.style.display = "none";
  } 

  // 네이버 API 설정 값을 읽습니다.

  function getNaverApiConfig() {
    return {
      clientId: window.KORAIL_MAP_CONFIG?.naverClientId?.trim() || "",
      clientSecret: window.KORAIL_MAP_CONFIG?.naverClientSecret?.trim() || ""
    };
  }

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

  function buildGoogleApiError(message) {
    return message || "API 요청에 실패했습니다.";
  }

  // content script를 통해 백그라운드에 네이버 API 요청을 보냅니다.

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
    if (minutes < 60) return getKorailLocale() === "en" ? `${minutes} ${t("minute")}` : `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    if (getKorailLocale() === "en") return remain ? `${hours} ${t("hour")} ${remain} ${t("minute")}` : `${hours} ${t("hour")}`;
    return remain ? `${hours}시간 ${remain}분` : `${hours}시간`;
  }

  // 가까운 역 검색 결과 영역을 렌더링합니다.

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
      positionIntroNearestPanel(panel);
      return;
    }

    result.innerHTML = `
      <span class="korail-nearest-card__result-label">TOP ${stations.length}</span>
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
    positionIntroNearestPanel(panel);
  }

  // 주소를 좌표로 변환합니다.

  async function geocodeAddress(address) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=kr`;
    const response = await fetch(url, { headers: { "Accept-Language": getKorailLocale(), "User-Agent": "KorailMapExtension/1.0" } });
    if (!response.ok) throw new Error(`${t("geocodeFailed")}: ${response.status}`);
    const data = await response.json();
    if (!data[0]) throw new Error(t("geocodeNotFound"));
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  }

  // 현재 위치에서 가까운 주요 역을 거리순으로 고릅니다.

  function getNearestByDistance(origin, limit = 3, includeAllStations = false) {
    return getSearchStations(includeAllStations)
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

  // 현재 위치에서 각 역까지의 길찾기 요약 정보를 조회합니다.

  async function getRoutesInfo(origin, stations) {
    const { clientId, clientSecret } = getNaverApiConfig();
    let lastError = null;
    const results = [];

    for (const station of stations) {
      try {
        const drivingData = await requestNaverApi("driving", { clientId, clientSecret, startLat: origin.lat, startLng: origin.lng, goalLat: station.lat, goalLng: station.lng });
        const drivingSummary = drivingData.route?.trafast?.[0]?.summary;
        if (!drivingSummary) continue;
        results.push({
          ...station,
          durationSeconds: drivingSummary.duration / 1000,
          durationText: formatDuration(drivingSummary.duration / 1000),
          distanceText: formatDistance(drivingSummary.distance),
          distanceMeters: drivingSummary.distance,
        });
      } catch (error) {
        lastError = error;
        console.warn("[Korail] Naver driving request failed:", station.name, error);
      }
    }

    if (!results.length && lastError) throw lastError;
    return results;
  }

  // 입력 주소 기준 가까운 주요 역 검색을 실행합니다.

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
      const includeAllStations = panel.querySelector("[data-nearest-include-all]")?.checked === true;
      const candidateLimit = includeAllStations ? 8 : 5;
      const resultLimit = includeAllStations ? 5 : 3;
      const cacheKey = getNearestSearchCacheKey(address, includeAllStations);
      const cachedResults = nearestSearchCache.get(cacheKey);

      if (cachedResults) {
        await wait(1000);
        renderNearestResults(panel, "done", t("nearestStations"), cachedResults.slice(0, resultLimit));
        return;
      }

      const origin = await geocodeAddress(address);
      const candidateStations = getNearestByDistance(origin, candidateLimit, includeAllStations);
      const results = await getRoutesInfo(origin, candidateStations);
      if (!results.length) throw new Error("Naver Direction 5 결과를 가져오지 못했습니다.");
      results.sort((a, b) => a.durationSeconds - b.durationSeconds);
      nearestSearchCache.set(cacheKey, results.map((station) => ({ ...station })));
      renderNearestResults(panel, "done", t("nearestStations"), results.slice(0, resultLimit));
    } catch (error) {
      renderNearestResults(panel, "error", error.message || t("searchError"));
    }
  }

  function getNearestSearchCacheKey(address, includeAllStations) {
    const normalizedAddress = address
      .replace(/\s+/g, "")
      .toLowerCase();
    return `${includeAllStations ? "all" : "major"}:${normalizedAddress}`;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 가까운 역 패널의 검색 이벤트를 연결합니다.

  function bindHomeNearestPanel(panel) {
    const form = panel.querySelector("[data-nearest-form]");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      searchNearestStations(panel);
    });
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
          <label class="korail-nearest-search__label" for="korail-nearest-address">${t("departureLocation")}</label>
          <div class="korail-nearest-search__row">
            <input id="korail-nearest-address" data-nearest-address type="text" placeholder="${t("addressPlaceholder")}" autocomplete="street-address">
            <button type="submit" class="korail-nearest-card__button">${t("search")}</button>
          </div>
          <label class="korail-nearest-search__toggle">
            <input data-nearest-include-all type="checkbox">
            <span class="korail-nearest-search__switch" aria-hidden="true"></span>
            <span>${t("includeAllStations")}</span>
          </label>
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
    if (isLoginPage()) {
      cleanupHomeNearestPanel();
      return;
    }

    const isIntroPage = location.pathname.includes("/intro");
    const isButtonOnlyMain = location.pathname.includes("/main") && getKorailLocale() !== "ko";
    const existingPanel = document.getElementById(HOME_PANEL_ID);
    if (existingPanel && isButtonOnlyMain && !document.getElementById("korail-main-toggle-btn")) {
      cleanupHomeNearestPanel();
    } else if (existingPanel) {
      if (isButtonOnlyMain) {
        if (existingPanel.dataset.korailLang !== getKorailLocale()) {
          renderHomeNearestPanel(existingPanel);
          bindHomeNearestPanel(existingPanel);
        }
        const isOpen = existingPanel.dataset.mainOpen === "true";
        existingPanel.style.display = isOpen ? "" : "none";
        const toggleBtn = document.getElementById("korail-main-toggle-btn");
        if (toggleBtn) toggleBtn.textContent = nearestToggleText(isOpen);
        updateNearestDisabledState();
        return;
      }

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

    const panel = document.createElement("section");
    panel.id = HOME_PANEL_ID;
    renderHomeNearestPanel(panel);

    if (isIntroPage) {
      injectIntroPanel(panel);
    } else if (isButtonOnlyMain) {
      injectMainButtonPanel(panel);
    } else {
      document.body.appendChild(panel);
      bindHomeNearestPanel(panel);
      positionHomeNearestPanel(panel);
      updateNearestDisabledState();
    }
  }

  // 인트로 화면의 가까운 역 패널을 삽입합니다.

  function injectIntroPanel(panel) {
    console.log("[Korail] injectIntroPanel called");
    document.getElementById("korail-intro-toggle-btn")?.remove();
    const searchBtn = document.querySelector("button.search_btn");
    const searchSection = document.querySelector("section.search");
    console.log("[Korail] intro searchBtn:", !!searchBtn, "searchSection:", !!searchSection);
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
    window.addEventListener("resize", () => {
      positionToggleBtn();
      positionIntroNearestPanel(panel);
    });

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

  function injectMainButtonPanel(panel) {
    document.getElementById("korail-main-toggle-btn")?.remove();
    document.getElementById("korail-main-toggle-host")?.remove();

    const toggleHost = document.createElement("div");
    toggleHost.id = "korail-main-toggle-host";
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "korail-main-toggle-btn";
    toggleBtn.textContent = nearestToggleText(false);

    panel.style.cssText = `
      position: fixed;
      z-index: 9998;
      display: none;
      width: 340px;
    `;
    panel.dataset.mainOpen = "false";

    document.body.appendChild(panel);
    toggleHost.appendChild(toggleBtn);
    document.body.appendChild(toggleHost);
    bindHomeNearestPanel(panel);

    function positionToggleBtn() {
      const controls = findMainBookingControls();
      const arrivalBtn = controls?.arrival || null;
      const lookupBtn = controls?.lookup || null;
      const fallbackSearchBtn = lookupBtn || findIntroSearchButton();
      const toggleWidth = 210;
      const toggleHeight = 42;

      const arrivalRect = arrivalBtn?.getBoundingClientRect();
      const lookupRect = lookupBtn?.getBoundingClientRect();
      const fallbackRect = fallbackSearchBtn?.getBoundingClientRect();
      const yRect = arrivalRect
        ? {
          top: arrivalRect.top + window.scrollY,
          height: arrivalRect.height,
        }
        : fallbackRect
          ? {
            top: fallbackRect.top + window.scrollY,
            height: fallbackRect.height,
          }
          : {
            top: Math.max(120, window.scrollY + window.innerHeight * 0.36),
            height: 42,
          };
      const xRect = lookupRect
        ? {
          left: lookupRect.left + window.scrollX,
          right: lookupRect.right + window.scrollX,
        }
        : fallbackRect
          ? {
            left: fallbackRect.left + window.scrollX,
            right: fallbackRect.right + window.scrollX,
          }
          : {
            left: Math.max(20, window.scrollX + window.innerWidth * 0.73 - 105),
            right: Math.max(20, window.scrollX + window.innerWidth * 0.73 + 105),
          };

      const desiredLeft = (xRect.left + xRect.right) / 2;
      const left = Math.min(
        Math.max(window.scrollX + toggleWidth / 2 + 10, desiredLeft),
        window.scrollX + window.innerWidth - toggleWidth / 2 - 10,
      );
      const top = arrivalRect
        ? Math.max(10, yRect.top + (yRect.height - toggleHeight) / 2)
        : Math.max(window.scrollY + 10, yRect.top - toggleHeight - 28);

      toggleHost.style.cssText = `
        position: absolute;
        top: ${top}px;
        left: ${left}px;
        transform: translateX(-50%);
        z-index: 9999;
        width: ${toggleWidth}px;
        height: ${toggleHeight}px;
        pointer-events: none;
      `;

      toggleBtn.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        display: block;
        width: ${toggleWidth}px;
        min-height: ${toggleHeight}px;
        margin: 0;
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
        pointer-events: auto;
      `;
    }

    positionToggleBtn();
    [250, 750, 1500].forEach((delay) => {
      window.setTimeout(positionToggleBtn, delay);
    });
    updateNearestDisabledState();

    let relayoutRaf = 0;
    function relayoutMainToggle() {
      window.cancelAnimationFrame(relayoutRaf);
      relayoutRaf = window.requestAnimationFrame(() => {
        positionToggleBtn();
        positionIntroNearestPanel(panel);
      });
    }

    window.addEventListener("resize", relayoutMainToggle);
    window.addEventListener("orientationchange", relayoutMainToggle);
    window.visualViewport?.addEventListener("resize", relayoutMainToggle);

    if (typeof ResizeObserver !== "undefined") {
      const resizeObserver = new ResizeObserver(relayoutMainToggle);
      const searchArea = findMainSearchArea();
      if (searchArea) resizeObserver.observe(searchArea);
    }

    toggleBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = panel.style.display !== "none";
      if (!isOpen) {
        panel.style.display = "";
        panel.dataset.mainOpen = "true";
        positionIntroNearestPanel(panel);
      } else {
        panel.style.display = "none";
        panel.dataset.mainOpen = "false";
      }
      toggleBtn.textContent = nearestToggleText(!isOpen);
      updateNearestDisabledState();
    });
  }

  window.injectHomeFeature = injectHomeNearestPanel;
  
  // 날짜/인원 선택 팝업 열림·닫힘을 직접 감지해 nearest 패널 z-index를 즉시 조정합니다.
    
    
  function setNearestPanelZIndex(behind) {
    [
      document.getElementById(HOME_PANEL_ID),
      document.getElementById("korail-nearest-mini-btn"),
      document.getElementById("korail-intro-toggle-btn"),
    ].forEach((el) => {
      if (el) el.style.zIndex = behind ? "0" : "";
    });
  }
  
  function observeBookingOptionPopup() {
    let wasOpen = false;
    const observer = new MutationObserver(() => {
      const isOpen = isBookingOptionPopupOpen();
      if (isOpen === wasOpen) return;
      wasOpen = isOpen;
      setNearestPanelZIndex(isOpen);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
  
  observeBookingOptionPopup();

  window.KORAIL_HOME = {
    cleanup,
    cleanupHomeNearestPanel,
    isLoginPage,
    updateNearestDisabledState,
    positionHomeNearestPanel,
    injectHomeNearestPanel,
  };
}); // waitForL
