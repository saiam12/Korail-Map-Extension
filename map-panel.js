// Leaflet 지도를 패널에 렌더링합니다. 마커 호버 시 역 이름 툴팁을 표시합니다.

function renderMap(container, dep, arr, stations, fullRoute) {
  try {
    window._korailMapInstance = initMap(container, dep, arr, stations, fullRoute);
  } catch (error) {
    console.warn("[Korail Map] Failed to render route map:", error);
  }
}

function initMap(container, dep, arr, stations, fullRoute) {
  stations = stations.filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng));
  if (stations.length === 0) return;

  const koreaBounds = L.latLngBounds(
    L.latLng(33.5, 125.5),//33,124.5
    L.latLng(38.9, 130.0)//38.9,131
  );

  // 지도 중심: 구간 중간 역 기준
  const mid = stations[Math.floor((stations.length)/ 2)];
  const map = L.map(container, {
    maxBounds: koreaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 7,
  }).setView([mid.lat, mid.lng], 7);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 16,
  }).addTo(map);

  const selectedNames = new Set(stations.map((s) => s.name));

  // 전체 노선 회색 라인
  const fullCoords = fullRoute
    .filter((name) => STATIONS[name] && Number.isFinite(STATIONS[name].lat) && Number.isFinite(STATIONS[name].lng))
    .map((name) => [STATIONS[name].lat, STATIONS[name].lng]);
  if (fullCoords.length >= 2) {
    L.polyline(fullCoords, { color: "#cccccc", weight: 3 }).addTo(map);
  }

  // 선택 구간 파란 라인
  const selCoords = stations.map((s) => [s.lat, s.lng]);
  if (selCoords.length >= 2) {
    L.polyline(selCoords, { color: "#1A3A6B", weight: 4 }).addTo(map);
  }

  // 전체 노선 역 마커
  fullRoute.forEach((name) => {
    if (!STATIONS[name]) return;
    const coords = STATIONS[name];
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;
    const isDep = name === dep;
    const isArr = name === arr;
    const isInRoute = selectedNames.has(name);

    const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : isInRoute ? "is-active" : "is-gray";
    const labelClass = isDep ? "is-dep" : isArr ? "is-arr" : "";

    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap">
               <div class="korail-dot ${dotClass}"></div>
               ${isDep || isArr ? `<span class="korail-dot-label ${dotClass}">${name}</span>` : ""}
             </div>`,
      iconAnchor: [6, 6],
    });

    L.marker([coords.lat, coords.lng], { icon })
      .addTo(map)
      .bindTooltip(name, { permanent: false, direction: "top" });
  });

  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

function renderStationMap(container, popup, currentDep, currentArr) {
  initStationMap(container, popup, currentDep, currentArr);
}

function initStationMap(container, popup, currentDep, currentArr) {
  const koreaBounds = L.latLngBounds(
    L.latLng(33.5, 125.5),
    L.latLng(38.9, 130.0)
  );
  const map = L.map(container, {
    maxBounds: koreaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 5,
  }).setView([36.5, 127.8], 7);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", {
    maxZoom: 12,
  }).addTo(map);

  // 모든 역 마커 생성 (초기엔 지도에 추가 안 함)
  const markers = {};
  Object.entries(STATIONS).forEach(([name, coords]) => {
    const isCurrentDep = name === currentDep;
    const isCurrentArr = name === currentArr;
    const isMajor = coords.major === true;
    const dotClass = isCurrentDep ? "is-dep" : isCurrentArr ? "is-arr" : "is-gray";
    const majorClass = isMajor ? "is-major" : "";

    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap">
               <div class="korail-dot ${dotClass} ${majorClass}"></div>
               ${isCurrentDep || isCurrentArr ? `<span class="korail-dot-label ${dotClass}">${name}</span>` : ""}
             </div>`,
      iconAnchor: [6, 6],
    });
    markers[name] = L.marker([coords.lat, coords.lng], { icon })
      .bindTooltip(name, { permanent: false, direction: "top" })
      .on("click", () => {
        const activeTab = popup.querySelector(".tabPage.active") || popup;
        activeTab.querySelectorAll("a").forEach((a) => {
          if (a.textContent.trim() === name) a.click();
        });
      });
  });

  function getMajorStationNames() {
    return Object.keys(STATIONS).filter(n => STATIONS[n].major);
  }

  function showOnlyStations(names) {
    const nameSet = new Set(names);
    Object.entries(markers).forEach(([name, marker]) => {
      if (nameSet.has(name)) {
        if (!map.hasLayer(marker)) marker.addTo(map);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }

  function showMajorStations() {
    showOnlyStations(getMajorStationNames());
    map.flyTo([36.5, 127.8], 7, { duration: 0.5 });
  }

  const highlightIcon = (name, on) => {
    const el = markers[name]?.getElement()?.querySelector(".korail-dot");
    if (!el) return;
    el.style.background = on ? "#1A3A6B" : "";
    el.style.transform = on ? "scale(1.5)" : "scale(1)";
    el.classList.toggle("is-gray", !on);
  };

  function attachStationHover(stationList) {
    stationList.querySelectorAll("a").forEach((a) => {
      const name = a.textContent.trim();
      if (!STATIONS[name]) return;
      if (a._korailBound) return;
      a._korailBound = true;
      a.addEventListener("mouseenter", () => {
        highlightIcon(name, true);
        // 현재 줌 그대로 유지하며 위치만 이동
        map.panTo([STATIONS[name].lat, STATIONS[name].lng], { animate: true, duration: 0.4 });
      });
      a.addEventListener("mouseleave", () => highlightIcon(name, false));
    });
  }

  function attachRegionHover(regionList) {
    regionList.querySelectorAll("a").forEach((a) => {
      if (a._korailRegionHoverBound) return;
      a._korailRegionHoverBound = true;
      a.addEventListener("mouseenter", () => {
        // 선택된(active) 지역일 때만 트래킹
        const isActive = a.closest("li")?.classList.contains("active") ||
                        a.classList.contains("active") ||
                        a.closest(".ch_tag")?.classList.contains("active");
        if (!isActive) return;
        const regionName = a.textContent.trim();
        const stationNames = (REGION_STATIONS[regionName] || []).filter(n => STATIONS[n]);
        if (stationNames.length > 0) {
          const coords = stationNames.map(n => [STATIONS[n].lat, STATIONS[n].lng]);
          map.flyToBounds(coords, { padding: [30, 30], duration: 0.5 });
        }
      });
    });
  } 

  function attachTabEvents() {
    const activeTab = popup.querySelector(".tabPage.active") || popup;
    const items = activeTab.querySelectorAll(".travel-ch_list li");

    if (items.length >= 2) {
      // 지역별 탭
      const regionList = items[0];
      const stationList = items[1];

      // 현재 활성 지역의 역 표시
      const activeRegionBtn = regionList.querySelector(".ch_tag.active a, a.active");
      const activeRegionName = activeRegionBtn?.textContent.trim() || "";
      const currentStationNames = (REGION_STATIONS[activeRegionName] || []).filter(n => STATIONS[n]);
      if (currentStationNames.length > 0 && !map._korailInitialized) {
        map._korailInitialized = true;
        showOnlyStations(currentStationNames);
        const coords = currentStationNames.map(n => [STATIONS[n].lat, STATIONS[n].lng]);
        map.flyToBounds(coords, { padding: [30, 30], duration: 0.5 });
      }

      regionList.querySelectorAll("a").forEach((a) => {
        if (a._korailRegionBound) return;
        a._korailRegionBound = true;
        a.addEventListener("click", () => {
          const regionName = a.textContent.trim();
          const stationNames = (REGION_STATIONS[regionName] || []).filter(n => STATIONS[n]);
          showOnlyStations(stationNames);
          if (stationNames.length > 0) {
            const coords = stationNames.map(n => [STATIONS[n].lat, STATIONS[n].lng]);
            map.flyToBounds(coords, { padding: [30, 30], duration: 0.5 });
          }
          setTimeout(() => attachStationHover(stationList), 150);
        });
      });

      //attachRegionHover(regionList);
      attachStationHover(stationList);

    } else {
      // 주요역 탭
      showMajorStations();

      [currentDep, currentArr].forEach(name => {
        if (name && STATIONS[name] && !STATIONS[name].major) {
          if (!map.hasLayer(markers[name])) markers[name].addTo(map);
        }
      });

      activeTab.querySelectorAll("a").forEach((a) => {
        const name = a.textContent.trim();
        if (!STATIONS[name]) return;
        if (a._korailBound) return;
        a._korailBound = true;
        a.addEventListener("mouseenter", () => {
          highlightIcon(name, true);
          map.panTo([STATIONS[name].lat, STATIONS[name].lng], { animate: true, duration: 0.4 });
        });
        a.addEventListener("mouseleave", () => highlightIcon(name, false));
      });
    }
  }

  // 초기 주요역 표시
  showMajorStations();
  attachTabEvents();

  const tabObserver = new MutationObserver(() => {
    popup.querySelectorAll("a").forEach(a => { a._korailBound = false; a._korailRegionBound = false; a._korailRegionHoverBound = false; });
    attachTabEvents();
  });
  tabObserver.observe(popup, { attributes: true, subtree: true, attributeFilter: ["class"] });

  setTimeout(() => map.invalidateSize(), 100);
}
