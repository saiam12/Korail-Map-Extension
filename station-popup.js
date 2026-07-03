// Station Information 팝업 옆 지도 표시 기능입니다.

waitForL(() => {
  const { getCurrentStationKey } = window.KORAIL_SHARED;

  // 기차역 조회 팝업이 열릴 때 nearest 패널을 팝업 뒤로 보냅니다. 
  function setNearestPanelBehindPopup(behind) {
    const { HOME_PANEL_ID } = window.KORAIL_SHARED;
    const panel = document.getElementById(HOME_PANEL_ID);
    const miniBtn = document.getElementById("korail-nearest-mini-btn");
    const introBtn = document.getElementById("korail-intro-toggle-btn");
    [panel, miniBtn, introBtn].forEach((el) => {
      if (el) el.style.zIndex = behind ? "0" : "";
    });
  }

  // Station Information 팝업 생성/제거를 감시합니다.
  function observeStationPopup() {
    const observer = new MutationObserver(() => {
      const popup = document.querySelector(".layerWrap.type_tranin-station-pop_wrap");
      const existing = document.getElementById("korail-station-map-popup");

      if (popup && !existing) {
        setNearestPanelBehindPopup(true);
        showStationMapPopup(popup);
      } else if (!popup && existing) {
        existing.remove();
        setNearestPanelBehindPopup(false);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Station Information 팝업 옆에 지도 영역을 표시합니다.

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

    // Initialize the map after the popup size is fixed.
    setTimeout(() => {
      const popupRect = popup.getBoundingClientRect();
      const mapHeight = popupRect.height;

      mapPopup.style.position = "fixed";
      mapPopup.style.top = popupRect.top + "px";
      mapPopup.style.left = (popupRect.right + gap) + "px";
      mapPopup.style.width = mapWidth + "px";
      mapPopup.style.height = mapHeight + "px";
      // Render after the map container has been placed.
      renderStationMap(mapPopup, popup, currentDep, currentArr);
    }, 50);
  }

  observeStationPopup();

  window.KORAIL_STATION_POPUP = { observeStationPopup };
}); // waitForL
