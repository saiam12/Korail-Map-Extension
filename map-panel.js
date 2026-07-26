// Leaflet 지도를 패널에 렌더링합니다. 마커 호버 시 역 이름 툴팁을 표시합니다.

function korailDisplayStationName(name) {
  return window.KORAIL_I18N?.stationName?.(name) || name;
}

function korailStationKey(label) {
  const key = window.KORAIL_I18N?.stationKey?.(label) || label;
  if (STATIONS[key]) return key;

  const shared = window.KORAIL_SHARED;
  const normalized = shared?.normalizeStationLabel?.(label);
  if (!normalized) return key;
  return Object.keys(shared?.STATION_EN || {}).find(
    (name) => shared.normalizeStationLabel(shared.STATION_EN[name]) === normalized
  ) || key;
}

function addKorailMapLabelToggle(map, maxZoom) {
  if (window.KORAIL_I18N?.getLocale?.() === "ko") return;

  const labelPane = map.createPane("korailLabelPane");
  labelPane.style.zIndex = "350";
  labelPane.style.pointerEvents = "none";

  const labelLayer = L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}.png", {
    minZoom: 8,
    maxZoom,
    pane: "korailLabelPane",
  });

  const LabelToggleControl = L.Control.extend({
    options: { position: "topright" },
    onAdd() {
      const control = L.DomUtil.create("div", "korail-map-label-control leaflet-control");
      const labelText = "Labels";
      control.innerHTML = `<label><span>${labelText}</span><input type="checkbox" aria-label="${labelText}"><span class="korail-map-label-control__switch" aria-hidden="true"></span></label>`;
      L.DomEvent.disableClickPropagation(control);
      L.DomEvent.disableScrollPropagation(control);
      control.querySelector("input").addEventListener("change", (event) => {
        if (event.target.checked) {
          if (!map.hasLayer(labelLayer)) labelLayer.addTo(map);
        } else if (map.hasLayer(labelLayer)) {
          map.removeLayer(labelLayer);
        }
      });
      return control;
    },
  });

  new LabelToggleControl().addTo(map);
}

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
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  }).setView([mid.lat, mid.lng], 7);

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", {
    attribution: "© OpenStreetMap © CARTO",
    maxZoom: 16,
  }).addTo(map);
  addKorailMapLabelToggle(map, 16);

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
      className: "korail-station-marker",
      html: `<div class="korail-dot-wrap ${isDep || isArr ? "is-label" : ""}">
               ${isDep || isArr
                  ? `<span class="korail-dot-label ${dotClass}">${korailDisplayStationName(name)}</span>`
                 : `<div class="korail-dot ${dotClass}"></div>`}
               <span class="korail-marker-hitarea" style="--korail-hit-size: 11px" aria-hidden="true"></span>
              </div>`,
      iconSize: isDep || isArr ? [0, 0] : [11, 11],
      iconAnchor: isDep || isArr ? [0, 0] : [5.5, 5.5],
    });

    L.marker([coords.lat, coords.lng], { icon })
      .addTo(map)
      .bindTooltip(korailDisplayStationName(name), { permanent: false, direction: "top" });
  });

  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

function renderStationMap(container, popup, currentDep, currentArr) {
  return initStationMap(container, popup, currentDep, currentArr);
}

function initStationMap(container, popup, currentDep, currentArr) {
  currentDep = korailStationKey(currentDep);
  currentArr = korailStationKey(currentArr);

  const koreaBounds = L.latLngBounds(
    L.latLng(33.5, 125.5),
    L.latLng(38.9, 130.0)
  );
  const isGlobalLocale = window.KORAIL_I18N?.getLocale?.() !== "ko";
  const map = L.map(container, {
    maxBounds: koreaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 5,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  }).setView([36.5, 127.8], 7);

  const hoverPane = map.createPane("korailStationHoverPane");
  hoverPane.style.zIndex = "700";
  hoverPane.style.pointerEvents = "none";

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png", {
    maxZoom: 12,
  }).addTo(map);
  addKorailMapLabelToggle(map, 12);
  const stationRenderer = L.canvas({ padding: 0.5 });
  const stationMarkerBorderWeight = 1.5;
  const stationMarkerRadius = (isMajor) => ((isMajor ? 11 : 9) - stationMarkerBorderWeight) / 2;
  const stationHoverRadius = (isMajor) => isMajor ? 6 : 5.5;

  // 모든 역 마커 생성 (초기엔 지도에 추가 안 함)
  const markers = {};
  let hoverMarker = null;
  let hoverTrackingEnabled = true;
  let visibleStationNames = new Set();
  Object.entries(STATIONS).forEach(([name, coords]) => {
    const isCurrentDep = name === currentDep;
    const isCurrentArr = name === currentArr;
    const isMajor = coords.major === true;
    const dotClass = isCurrentDep ? "is-dep" : isCurrentArr ? "is-arr" : "is-gray";

    let marker;
    if (isCurrentDep || isCurrentArr) {
      const icon = L.divIcon({
        className: "korail-station-marker",
        html: `<div class="korail-dot-wrap is-label">
                 <span class="korail-dot-label ${dotClass}">${korailDisplayStationName(name)}</span>
                 <span class="korail-marker-hitarea" style="--korail-hit-size: 11px" aria-hidden="true"></span>
                </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      marker = L.marker([coords.lat, coords.lng], { icon, riseOnHover: true, riseOffset: 1000 });
    } else {
      marker = L.circleMarker([coords.lat, coords.lng], {
        renderer: stationRenderer,
        radius: stationMarkerRadius(isMajor),
        color: "#ffffff",
        weight: stationMarkerBorderWeight,
        fillColor: "#888888",
        fillOpacity: 1,
        opacity: 1,
      });
    }

    markers[name] = marker
      .bindTooltip(korailDisplayStationName(name), { permanent: false, direction: "top" })
      .on("click", () => {
        const activeTab = popup.querySelector(".tabPage.active") || popup;
        activeTab.querySelectorAll("a, button").forEach((a) => {
          if (korailStationKey(a.textContent.trim()) === name) a.click();
        });
      });
  });

  function getMajorStationNames() {
    return Object.keys(STATIONS).filter(n => STATIONS[n].major);
  }

  function isVisibleElement(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0
      && rect.height > 0
      && style.display !== "none"
      && style.visibility !== "hidden";
  }

  function getVisibleStationNames(scope) {
    const activeTab = scope || popup.querySelector(".tabPage.active") || popup;
    return [...new Set([...activeTab.querySelectorAll("a, button")]
      .filter(isVisibleElement)
      .map((a) => korailStationKey(a.textContent.trim()))
      .filter((name) => STATIONS[name]))];
  }

  function showOnlyStations(names) {
    const nameSet = new Set(names);
    if (markers[currentDep]) nameSet.add(currentDep);
    if (markers[currentArr]) nameSet.add(currentArr);
    const unchanged = nameSet.size === visibleStationNames.size
      && [...nameSet].every((name) => visibleStationNames.has(name));
    if (unchanged) return false;

    visibleStationNames.forEach((name) => {
      if (!nameSet.has(name) && markers[name]) map.removeLayer(markers[name]);
    });
    nameSet.forEach((name) => {
      if (!visibleStationNames.has(name)) markers[name]?.addTo(map);
    });
    visibleStationNames = nameSet;
    return true;
  }

  function moveToRegionStations(stationNames, animate) {
    if (!stationNames.length) return;
    const coords = stationNames.map((name) => [STATIONS[name].lat, STATIONS[name].lng]);
    map.stop();
    if (animate) {
      map.flyToBounds(coords, {
        padding: [30, 30],
        animate: true,
        duration: 0.45,
        easeLinearity: 0.2,
      });
      return;
    }
    map.fitBounds(coords, { padding: [30, 30], animate: false });
  }

  function showMajorStations() {
    const stationNames = isGlobalLocale ? getVisibleStationNames() : getMajorStationNames();
    const changed = showOnlyStations(stationNames.length ? stationNames : getMajorStationNames());
    if (changed) map.setView([36.5, 127.8], 7, { animate: false });
  }

  const highlightIcon = (name, on) => {
    const marker = markers[name];
    if (typeof marker?.setStyle === "function" && typeof marker?.setRadius === "function") {
      const baseRadius = stationMarkerRadius(STATIONS[name]?.major === true);
      const hoverRadius = stationHoverRadius(STATIONS[name]?.major === true);
      marker.setStyle({ fillColor: on ? "#183D78" : "#888888" });
      marker.setRadius(on ? hoverRadius : baseRadius);
      return;
    }

    marker?.setZIndexOffset(on ? 1000 : 0);
    const markerElement = marker?.getElement();
    const label = markerElement?.querySelector(".korail-dot-label");
    if (label) {
      label.classList.toggle("is-hovered", on);
      return;
    }
    const el = markerElement?.querySelector(".korail-dot");
    if (!el) return;
    const baseSize = STATIONS[name]?.major === true ? 10 : 7;
    const hoverScale = 12 / baseSize;
    el.style.background = on ? "#183D78" : "";
    el.style.transform = on ? `scale(${hoverScale})` : "scale(1)";
    el.classList.toggle("is-gray", !on);
  };

  const showHoverMarker = (name, on) => {
    if (hoverMarker) {
      map.removeLayer(hoverMarker);
      hoverMarker = null;
    }
    if (!on || !STATIONS[name] || name === currentDep || name === currentArr) return;
    const coords = STATIONS[name];
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) return;

    hoverMarker = L.circleMarker([coords.lat, coords.lng], {
      pane: "korailStationHoverPane",
      radius: stationHoverRadius(STATIONS[name].major === true),
      color: "#ffffff",
      weight: 3,
      fillColor: "#183D78",
      fillOpacity: 1,
      opacity: 1,
    }).addTo(map);
  };

  function attachStationHover(stationList) {
    stationList.querySelectorAll("a, button").forEach((a) => {
      const name = korailStationKey(a.textContent.trim());
      if (!STATIONS[name]) return;
      if (a._korailBound) return;
      a._korailBound = true;
      a.addEventListener("mouseenter", () => {
        highlightIcon(name, true);
        showHoverMarker(name, true);
        // 현재 줌 그대로 유지하며 위치만 이동
        if (hoverTrackingEnabled) {
          map.panTo([STATIONS[name].lat, STATIONS[name].lng], { animate: true, duration: 0.4 });
        }
      });
      a.addEventListener("mouseleave", () => {
        highlightIcon(name, false);
        showHoverMarker(name, false);
      });
    });
  }

  function attachRegionHover(regionList) {
    regionList.querySelectorAll("a, button").forEach((a) => {
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
        moveToRegionStations(stationNames, true);
      });
    });
  } 

  let trackingTogglePositioned = false;
  let activeStationTab = "";
  function attachTabEvents() {
    const activeTab = popup.querySelector(".tabPage.active") || popup;
    const items = activeTab.querySelectorAll(".travel-ch_list li");
    if (!isGlobalLocale && !trackingTogglePositioned) {
      const tabLabels = [...popup.querySelectorAll("*")]
        .filter((element) => element.children.length === 0 && isVisibleElement(element));
      const majorTab = tabLabels.find((element) => element.textContent.trim() === "주요역");
      const regionTab = tabLabels.find((element) => element.textContent.trim() === "지역별");
      let tabRow = majorTab?.parentElement;
      while (tabRow && regionTab && !tabRow.contains(regionTab)) tabRow = tabRow.parentElement;
      if (tabRow && regionTab && tabRow !== popup) {
        tabRow.classList.add("korail-station-tab-row");
        trackingToggle.classList.add("is-tab-row");
        if (trackingToggle.parentElement !== tabRow) tabRow.appendChild(trackingToggle);
        trackingTogglePositioned = true;
      }
    }

    if (isGlobalLocale) {
      activeStationTab = "global";
      const stationLists = [...items].filter((item) => getVisibleStationNames(item).length > 0);
      showMajorStations();
      stationLists.forEach((stationList) => attachStationHover(stationList));
      return;
    }

    const stationTab = items.length >= 2 ? "region" : "major";
    const enteredRegionTab = stationTab === "region" && activeStationTab !== "region";
    activeStationTab = stationTab;

    if (items.length >= 2) {
      // 지역별 탭
      const regionList = items[0];
      const stationList = items[1];

      // 현재 활성 지역의 역 표시
      const activeRegionBtn = regionList.querySelector(".ch_tag.active a, a.active");
      const activeRegionName = activeRegionBtn?.textContent.trim() || "";
      const currentStationNames = isGlobalLocale
        ? getVisibleStationNames(stationList)
        : (REGION_STATIONS[activeRegionName] || []).filter(n => STATIONS[n]);
      if (currentStationNames.length > 0 && enteredRegionTab) {
        showOnlyStations(currentStationNames);
        moveToRegionStations(currentStationNames, true);
      }

      regionList.querySelectorAll("a, button").forEach((a) => {
        if (a._korailRegionBound) return;
        a._korailRegionBound = true;
        a.addEventListener("click", () => {
          requestAnimationFrame(() => {
            const regionName = a.textContent.trim();
            const stationNames = isGlobalLocale
              ? getVisibleStationNames(stationList)
              : (REGION_STATIONS[regionName] || []).filter(n => STATIONS[n]);
            const changed = showOnlyStations(stationNames);
            if (changed) moveToRegionStations(stationNames, true);
          });
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

      activeTab.querySelectorAll("a, button").forEach((a) => {
        const name = korailStationKey(a.textContent.trim());
        if (!STATIONS[name]) return;
        if (a._korailBound) return;
        a._korailBound = true;
        a.addEventListener("mouseenter", () => {
          highlightIcon(name, true);
          showHoverMarker(name, true);
          if (hoverTrackingEnabled) {
            map.panTo([STATIONS[name].lat, STATIONS[name].lng], { animate: true, duration: 0.4 });
          }
        });
        a.addEventListener("mouseleave", () => {
          highlightIcon(name, false);
          showHoverMarker(name, false);
        });
      });
    }
  }

  // 초기 주요역 표시
  popup.querySelector(".korail-station-tracking-toggle")?.remove();
  const trackingText = isGlobalLocale ? "Map tracking" : "지도 트래킹";
  const trackingToggle = document.createElement("div");
  trackingToggle.className = "korail-station-tracking-toggle";
  trackingToggle.classList.toggle("is-korean", !isGlobalLocale);
  trackingToggle.innerHTML = `<label><input type="checkbox" checked aria-label="${trackingText}"><span class="korail-station-tracking-toggle__switch" aria-hidden="true"></span><span>${trackingText}</span></label>`;
  popup.appendChild(trackingToggle);
  trackingToggle.querySelector("input").addEventListener("change", (event) => {
    hoverTrackingEnabled = event.target.checked;
    if (!hoverTrackingEnabled) map.stop();
  });

  showMajorStations();
  attachTabEvents();

  let tabUpdateFrame = 0;
  const tabObserver = new MutationObserver((records) => {
    const hasRelevantMutation = records.some((record) => {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      return !target?.closest?.(".korail-station-tracking-toggle");
    });
    if (!hasRelevantMutation || tabUpdateFrame) return;
    tabUpdateFrame = requestAnimationFrame(() => {
      tabUpdateFrame = 0;
      attachTabEvents();
    });
  });
  tabObserver.observe(popup, { attributes: true, childList: true, subtree: true, attributeFilter: ["class"] });

  const invalidateTimer = setTimeout(() => map.invalidateSize(), 100);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(invalidateTimer);
    if (tabUpdateFrame) cancelAnimationFrame(tabUpdateFrame);
    tabObserver.disconnect();
    map.remove();
  };
}
