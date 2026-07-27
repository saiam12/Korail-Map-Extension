// Station Information 팝업 옆 지도 표시 기능입니다.

waitForL(() => {
  const { getCurrentStationKey } = window.KORAIL_SHARED;

  // 기차역 조회 팝업이 열릴 때 nearest 패널을 팝업 뒤로 보냅니다. 
  function setNearestPanelBehindPopup(behind) {
    const { HOME_PANEL_ID } = window.KORAIL_SHARED;
    const panel = document.getElementById(HOME_PANEL_ID);
    const miniBtn = document.getElementById("korail-nearest-mini-btn");
    const introBtn = document.getElementById("korail-intro-toggle-btn");
    const mainBtn = document.getElementById("korail-main-toggle-btn");
    const mainHost = document.getElementById("korail-main-toggle-host");
    [panel, miniBtn, introBtn, mainBtn, mainHost].forEach((el) => {
      if (!el) return;
      el.classList.toggle("is-korail-muted", behind);
      el.setAttribute("aria-hidden", behind ? "true" : "false");
    });
  }

  function mutationTouchesStationPopup(records) {
    const selector = ".layerWrap.type_tranin-station-pop_wrap";
    const containsPopup = (node) => node?.nodeType === 1
      && (node.matches(selector) || node.querySelector(selector));
    return records.some((record) => [...record.addedNodes, ...record.removedNodes].some(containsPopup));
  }

  // Station Information 팝업 생성/제거를 감시합니다.
  function observeStationPopup() {
    const syncStationPopup = () => {
      const popup = document.querySelector(".layerWrap.type_tranin-station-pop_wrap");
      const existing = document.getElementById("korail-station-map-popup");

      if (document.documentElement.dataset.korailStationSwap === "true") {
        existing?._korailCleanup?.();
        existing?.remove();
        popup?.querySelector(".korail-station-tracking-toggle")?.remove();
        return;
      }

      if (popup && !existing) {
        setNearestPanelBehindPopup(true);
        showStationMapPopup(popup);
      } else if (!popup && existing) {
        existing._korailCleanup?.();
        existing.remove();
        setNearestPanelBehindPopup(false);
      }
    };
    const observer = new MutationObserver((records) => {
      if (!mutationTouchesStationPopup(records)) return;
      syncStationPopup();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    syncStationPopup();
  }

  // Station Information 팝업 옆에 지도 영역을 표시합니다.

  function showStationMapPopup(popup) {
    const mapPopup = document.createElement("div");
    mapPopup.id = "korail-station-map-popup";
    popup.closest(".ReactModal__Overlay")?.appendChild(mapPopup) || document.body.appendChild(mapPopup);

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

    // Initialize the map after the popup size is fixed.
    const renderTimer = setTimeout(() => {
      if (!mapPopup.isConnected || !popup.isConnected) return;
      const popupRect = popup.getBoundingClientRect();
      const mapHeight = popupRect.height;

      mapPopup.style.position = "fixed";
      mapPopup.style.top = popupRect.top + "px";
      mapPopup.style.left = (popupRect.right + gap) + "px";
      mapPopup.style.width = mapWidth + "px";
      mapPopup.style.height = mapHeight + "px";
      // Render after the map container has been placed.
      mapPopup._korailCleanup = renderStationMap(mapPopup, popup, currentDep, currentArr);
    }, 50);
    mapPopup._korailCleanup = () => clearTimeout(renderTimer);
  }

  observeStationPopup();

  window.KORAIL_STATION_POPUP = { observeStationPopup };
}); // waitForL
