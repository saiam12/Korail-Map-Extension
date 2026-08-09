// Leaflet 지도를 패널에 렌더링합니다. 마커 호버 시 역 이름 툴팁을 표시합니다.

function korailDisplayStationName(name) {
  return window.KORAIL_I18N?.stationName?.(name) || name;
}

function korailRomanizeHangul(value) {
  const onsets = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
  const vowels = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"];
  const codas = ["", "k", "k", "ks", "n", "nj", "nh", "t", "l", "lk", "lm", "lb", "ls", "lt", "lp", "lh", "m", "p", "ps", "t", "t", "ng", "t", "t", "k", "t", "p", "h"];
  return [...String(value)].map((character) => {
    const syllable = character.charCodeAt(0) - 0xac00;
    if (syllable < 0 || syllable > 11171) return character;
    return onsets[Math.floor(syllable / 588)]
      + vowels[Math.floor((syllable % 588) / 28)]
      + codas[syllable % 28];
  }).join("");
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

const GLOBAL_STATION_SELECTION_ARM_MS = 1000;

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
  const isGlobalMainPage = isGlobalLocale && /^\/global\/[^/]+\/main\/?$/i.test(location.pathname);
  const usesHoverStationClick = true;
  const usesNativeStationClick = (isGlobalLocale && !isGlobalMainPage) || usesHoverStationClick;
  const map = L.map(container, {
    maxBounds: koreaBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 5,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  }).setView([36.5, 127.8], 7);

  const globalStationSelectionHint = usesNativeStationClick && !usesHoverStationClick ? document.createElement("div") : null;
  if (globalStationSelectionHint) {
    globalStationSelectionHint.className = "korail-station-map-selection-hint";
    globalStationSelectionHint.hidden = true;
    globalStationSelectionHint.textContent = "Double-click a station point to select it.";
    container.appendChild(globalStationSelectionHint);
  }

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
  let addressMarker = null;
  let matchedStationNames = [];
  const matchedStationStyles = new Map();
  let hoverTrackingEnabled = true;
  let visibleStationNames = new Set();
  let globalStationSelectionTimer = null;
  let globalStationSelectionOption = null;
  let globalStationSelectionName = "";
  let globalStationSelectionStyle = null;
  let globalStationSelectionClickHandler = null;
  let globalStationSelectionMouseLeaveHandler = null;
  let globalStationSelectionMouseMoveHandler = null;
  let globalStationSelectionPopupZIndex = null;
  let globalStationSelectionPlaceholder = null;
  let globalStationSelectionSourceElement = null;
  let addressResultsPointerMoveHandler = null;
  let guardedAddressResultItem = null;

  function stopAddressResultsPointerWait() {
    if (addressResultsPointerMoveHandler) {
      document.removeEventListener("pointermove", addressResultsPointerMoveHandler, true);
    }
    addressResultsPointerMoveHandler = null;
    guardedAddressResultItem?.classList.remove("is-pointer-guarded");
    guardedAddressResultItem = null;
  }

  function restoreGlobalStationOption(showHint = false) {
    clearTimeout(globalStationSelectionTimer);
    globalStationSelectionTimer = null;
    if (globalStationSelectionOption) {
      globalStationSelectionOption.removeEventListener("click", globalStationSelectionClickHandler);
      globalStationSelectionOption.removeEventListener("mouseleave", globalStationSelectionMouseLeaveHandler);
      globalStationSelectionOption.classList.remove("korail-station-map-native-target");
      if (globalStationSelectionStyle === null) globalStationSelectionOption.removeAttribute("style");
      else globalStationSelectionOption.setAttribute("style", globalStationSelectionStyle);
    }
    if (globalStationSelectionMouseMoveHandler) {
      document.removeEventListener("mousemove", globalStationSelectionMouseMoveHandler, true);
    }
    globalStationSelectionSourceElement?.classList.remove("is-native-hovered");
    if (globalStationSelectionName) {
      highlightIcon(globalStationSelectionName, false);
      showHoverMarker(globalStationSelectionName, false);
    }
    if (globalStationSelectionPopupZIndex !== null) {
      popup.style.zIndex = globalStationSelectionPopupZIndex;
      globalStationSelectionPopupZIndex = null;
    }
    globalStationSelectionPlaceholder?.remove();
    globalStationSelectionPlaceholder = null;
    globalStationSelectionSourceElement = null;
    globalStationSelectionOption = null;
    globalStationSelectionName = "";
    globalStationSelectionStyle = null;
    globalStationSelectionClickHandler = null;
    globalStationSelectionMouseLeaveHandler = null;
    globalStationSelectionMouseMoveHandler = null;
    if (showHint && globalStationSelectionHint) globalStationSelectionHint.hidden = false;
  }

  function armGlobalStationOption(option, name, pointerEvent, restoreOnMouseLeave = false, targetElement = null) {
    restoreGlobalStationOption();
    if (globalStationSelectionHint) globalStationSelectionHint.hidden = true;
    globalStationSelectionOption = option;
    globalStationSelectionName = name;
    globalStationSelectionSourceElement = targetElement;
    targetElement?.classList.add("is-native-hovered");
    globalStationSelectionStyle = option.getAttribute("style");
    globalStationSelectionPopupZIndex = popup.style.zIndex;
    globalStationSelectionPlaceholder = option.cloneNode(true);
    globalStationSelectionPlaceholder.removeAttribute("href");
    globalStationSelectionPlaceholder.setAttribute("aria-hidden", "true");
    globalStationSelectionPlaceholder.tabIndex = -1;
    globalStationSelectionPlaceholder.classList.add("korail-station-map-placeholder");
    option.before(globalStationSelectionPlaceholder);
    popup.style.zIndex = "2147483646";
    const point = map.latLngToContainerPoint([STATIONS[name].lat, STATIONS[name].lng]);
    const rect = container.getBoundingClientRect();
    const targetRect = targetElement?.getBoundingClientRect();
    const targetX = targetRect
      ? targetRect.left + targetRect.width / 2
      : Number.isFinite(pointerEvent?.clientX) ? pointerEvent.clientX : rect.left + point.x;
    const targetY = targetRect
      ? targetRect.top + targetRect.height / 2
      : Number.isFinite(pointerEvent?.clientY) ? pointerEvent.clientY : rect.top + point.y;
    option.classList.add("korail-station-map-native-target");
    option.style.left = `${targetX}px`;
    option.style.top = `${targetY}px`;
    if (targetRect) {
      option.style.setProperty("--korail-native-target-width", `${targetRect.width}px`);
      option.style.setProperty("--korail-native-target-height", `${targetRect.height}px`);
      option.style.setProperty("--korail-native-target-radius", "8px");
    }
    const clickedOption = option;
    globalStationSelectionClickHandler = () => {
      clearTimeout(globalStationSelectionTimer);
      globalStationSelectionTimer = setTimeout(() => {
        if (globalStationSelectionOption === clickedOption) restoreGlobalStationOption();
      }, 0);
    };
    option.addEventListener("click", globalStationSelectionClickHandler, { once: true });
    if (restoreOnMouseLeave) {
      globalStationSelectionMouseLeaveHandler = () => restoreGlobalStationOption();
      option.addEventListener("mouseleave", globalStationSelectionMouseLeaveHandler, { once: true });
      globalStationSelectionMouseMoveHandler = (event) => {
        const sourceRect = globalStationSelectionSourceElement?.getBoundingClientRect();
        const isWithinSource = sourceRect
          && event.clientX >= sourceRect.left
          && event.clientX <= sourceRect.right
          && event.clientY >= sourceRect.top
          && event.clientY <= sourceRect.bottom;
        if (event.target !== option && !option.contains(event.target) && !isWithinSource) {
          restoreGlobalStationOption();
        }
      };
      document.addEventListener("mousemove", globalStationSelectionMouseMoveHandler, true);
      return;
    }
    globalStationSelectionTimer = setTimeout(
      () => restoreGlobalStationOption(true),
      GLOBAL_STATION_SELECTION_ARM_MS,
    );
  }

  function findVisibleStationOption(name) {
    const activeTab = popup.querySelector(".tabPage.active") || popup;
    return [...activeTab.querySelectorAll("a, button")]
      .find((element) => isNativeStationOption(element)
        && korailStationKey(element.textContent.trim()) === name
        && isVisibleElement(element));
  }

  function findVisiblePopupStationOption(name) {
    return [...popup.querySelectorAll("a, button")]
      .filter(isNativeStationOption)
      .find((element) => korailStationKey(element.textContent.trim()) === name && isVisibleElement(element));
  }

  function isNativeStationOption(element) {
    return !element.closest(".korail-station-address-search")
      && !element.classList.contains("korail-station-map-placeholder");
  }

  function armNativeStationOption(name, pointerEvent, targetElement = null) {
    const option = findVisibleStationOption(name);
    if (!option) return false;
    highlightIcon(name, true);
    armGlobalStationOption(option, name, pointerEvent, true, targetElement);
    return true;
  }

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
      .on("mouseover", (event) => {
        marker.closeTooltip();
        showHoverMarker(name, true);
        if (usesHoverStationClick) armNativeStationOption(name, event.originalEvent);
      })
      .on("mouseout", () => {
        if (!usesHoverStationClick) showHoverMarker(name, false);
      })
      .on("click", (event) => {
        const option = findVisibleStationOption(name);
        if (usesHoverStationClick) return;
        if (usesNativeStationClick) {
          if (!option) return;
          highlightIcon(name, true);
          armGlobalStationOption(option, name, event.originalEvent);
          return;
        }
        option?.click();
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

  function showAddressStationMatch(address, origin, stations) {
    const matchedStations = stations.filter((station) => STATIONS[station.name]);
    if (!matchedStations.length) return;

    addressMarker?.remove();
    clearMatchedStationMarkers();

    const addressLabel = document.createElement("span");
    addressLabel.textContent = address;
    addressMarker = L.circleMarker([origin.lat, origin.lng], {
      radius: stationMarkerRadius(false) + 1,
      color: "#fff",
      weight: stationMarkerBorderWeight,
      fillColor: "#00c853",
      fillOpacity: 1,
    }).addTo(map).bindTooltip(addressLabel);
    const matchedStationColors = matchedStations.length === 5
      ? ["#0052a4", "#4a85bd", "#4a85bd", "#9cc4e8", "#9cc4e8"]
      : ["#0052a4", "#4a85bd", "#9cc4e8"];
    matchedStationNames = matchedStations.map((station) => station.name);
    matchedStations.forEach((station, index) => {
      const marker = markers[station.name];
      if (!marker) return;
      if (!map.hasLayer(marker)) {
        marker.addTo(map);
        visibleStationNames.add(station.name);
      }
      const style = {
        color: matchedStationColors[index] || "#9cc4e8",
        radius: 7,
        weight: 3,
        rank: index + 1,
      };
      matchedStationStyles.set(station.name, style);
      applyMatchedStationStyle(station.name, style);
    });

    const matchBounds = L.latLngBounds([
      [origin.lat, origin.lng],
      ...matchedStations.map((station) => [STATIONS[station.name].lat, STATIONS[station.name].lng]),
    ]);
    map.fitBounds(matchBounds, {
      animate: true,
      maxZoom: 11,
      padding: [40, 40],
    });
  }

  function highlightMatchedStationMarker(index) {
    const name = matchedStationNames[index];
    if (!name) return;
    const marker = markers[name];
    if (typeof marker?.setStyle === "function" && typeof marker?.setRadius === "function") {
      marker.setRadius(10);
      marker.setStyle({ weight: 4 });
      marker.bringToFront();
    }
    marker?.openTooltip();
  }

  function resetMatchedStationMarkers() {
    matchedStationStyles.forEach((style, name) => {
      applyMatchedStationStyle(name, style);
      markers[name]?.closeTooltip();
    });
  }

  function applyMatchedStationStyle(name, style) {
    const marker = markers[name];
    marker?.setTooltipContent?.(`${style.rank}. ${korailDisplayStationName(name)}`);
    if (typeof marker?.setStyle !== "function" || typeof marker?.setRadius !== "function") return;
    marker.setRadius(style.radius);
    marker.setStyle({
      color: "#fff",
      weight: style.weight,
      fillColor: style.color,
      fillOpacity: 1,
      opacity: 1,
    });
  }

  function clearMatchedStationMarkers() {
    matchedStationStyles.forEach((style, name) => {
      const marker = markers[name];
      marker?.setTooltipContent?.(korailDisplayStationName(name));
      marker?.closeTooltip();
      if (typeof marker?.setStyle !== "function" || typeof marker?.setRadius !== "function") return;
      marker.setRadius(stationMarkerRadius(STATIONS[name]?.major === true));
      marker.setStyle({
        color: "#fff",
        weight: stationMarkerBorderWeight,
        fillColor: "#888888",
        fillOpacity: 1,
        opacity: 1,
      });
    });
    matchedStationNames = [];
    matchedStationStyles.clear();
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
      const matchedStyle = matchedStationStyles.get(name);
      const baseRadius = matchedStyle?.radius || stationMarkerRadius(STATIONS[name]?.major === true);
      const hoverRadius = matchedStyle ? 10 : stationHoverRadius(STATIONS[name]?.major === true);
      marker.setStyle({
        fillColor: on ? "#f97316" : matchedStyle?.color || "#888888",
        weight: on && matchedStyle ? 4 : matchedStyle?.weight || stationMarkerBorderWeight,
      });
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
    el.style.background = on ? "#f97316" : "";
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
      fillColor: "#f97316",
      fillOpacity: 1,
      opacity: 1,
    }).addTo(map)
      .bindTooltip(korailDisplayStationName(name), { permanent: false, direction: "top" })
      .openTooltip();
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
        if (hoverTrackingEnabled && !a.classList.contains("korail-station-map-native-target")) {
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

  function addAddressStationSearch() {
    if (popup.querySelector(".korail-station-address-search")) return;
    let stationSearchInput = [...popup.querySelectorAll("input")].find((input) => {
      return /역\s*이름|초성\s*검색|station|search/i.test(`${input.placeholder || ""} ${input.getAttribute("aria-label") || ""}`);
    });
    if (isGlobalLocale && !stationSearchInput) {
      const globalSearchHost = popup.querySelector(".type_station_lookup-pop");
      if (!globalSearchHost) return;
      const globalSearchRow = document.createElement("div");
      globalSearchRow.className = "sch_box korail-global-station-search";
      globalSearchRow.innerHTML = '<input type="text" data-global-station-search autocomplete="off"><button type="button" class="btn_sch"><span class="blind">Search</span></button>';
      globalSearchHost.prepend(globalSearchRow);
      stationSearchInput = globalSearchRow.querySelector("[data-global-station-search]");
    }
    if (!stationSearchInput?.parentElement) return;

    const stationSearchRow = stationSearchInput.parentElement;
    const submit = stationSearchRow.querySelector("button.btn_sch");
    if (!submit) return;
    const stationSearchPlaceholder = isGlobalLocale
      ? "Stations, initials, or addresses (City Hall, public offices)"
      : "역 이름·초성·주소(서울:ㅅㅇ, 대구 수성구, 서울시청)";
    const stationSearchTitle = isGlobalLocale
      ? "Enter a station name, initials, or address"
      : "역 이름, 초성 또는 주소를 입력해 주세요";
    stationSearchInput.placeholder = stationSearchPlaceholder;
    stationSearchInput.setAttribute("aria-label", stationSearchPlaceholder);
    stationSearchInput.title = stationSearchTitle;
    const addressSearch = document.createElement("div");
    addressSearch.className = "korail-station-address-search";
    const text = isGlobalLocale
      ? {
        currentLocation: "My location",
        history: "History",
        includeAllStations: "Include all stations",
        majorStationsOnly: "Major stations only",
        top: "TOP",
        noHistory: "No recent searches.",
      }
      : {
        currentLocation: "현 위치",
        history: "최근 기록",
        includeAllStations: "일반역 포함",
        majorStationsOnly: "주요역만",
        top: "TOP",
        noHistory: "최근 기록이 없습니다.",
      };
    addressSearch.innerHTML = `
      <div class="korail-station-address-search__actions">
        <div class="korail-station-address-search__toggles">
          <label class="korail-nearest-search__toggle">
            <input data-station-address-include-all type="checkbox">
            <span class="korail-nearest-search__switch" aria-hidden="true"></span>
            <span>${text.includeAllStations}</span>
          </label>
        </div>
        <button type="button" class="korail-nearest-location-button" data-station-address-current-location><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path></svg><span>${text.currentLocation}</span></button>
        <button type="button" class="korail-nearest-history-button" data-station-address-history-toggle aria-expanded="false" aria-controls="korail-station-address-history"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path></svg><span>${text.history}</span></button>
      </div>
      <div id="korail-station-address-history" class="korail-station-address-history" data-station-address-history hidden></div>
      <div class="korail-station-address-results" data-station-address-results hidden></div>
    `;
    stationSearchRow.insertAdjacentElement("afterend", addressSearch);
    if (isGlobalLocale) {
      const stationHeadingRow = popup.querySelector(".station_wrap");
      if (stationHeadingRow) {
        stationHeadingRow.classList.add("korail-station-heading-row");
        stationHeadingRow.prepend(trackingToggle);
      }
    }

    const input = stationSearchInput;
    const currentLocation = addressSearch.querySelector("[data-station-address-current-location]");
    const includeAllStations = addressSearch.querySelector("[data-station-address-include-all]");
    const historyToggle = addressSearch.querySelector("[data-station-address-history-toggle]");
    const history = addressSearch.querySelector("[data-station-address-history]");
    const results = addressSearch.querySelector("[data-station-address-results]");
    const isStationSearchValue = (value) => {
      const query = String(value || "").trim();
      return Boolean(STATIONS[korailStationKey(query)] || /^[ㄱ-ㅎ]+$/.test(query));
    };
    let addressStationArmRequest = 0;
    let addressResultsReadyRequest = 0;
    const restoreAddressSearchInput = () => {
      const address = input.dataset.korailAddressSearch;
      if (!address) return;
      input.value = isGlobalLocale ? korailRomanizeHangul(address) : address;
    };
    const armAddressSearchStation = (stationName, pointerEvent, item) => {
      const request = ++addressStationArmRequest;
      if (armNativeStationOption(stationName, pointerEvent, item) || isGlobalLocale) return;

      input.value = korailDisplayStationName(stationName);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      submit.click();

      let framesRemaining = 60;
      const armWhenReady = () => {
        if (request !== addressStationArmRequest || !popup.isConnected || !item.matches(":hover")) {
          restoreAddressSearchInput();
          return;
        }
        if (armNativeStationOption(stationName, pointerEvent, item)) {
          restoreAddressSearchInput();
          return;
        }
        if (framesRemaining-- > 0) requestAnimationFrame(armWhenReady);
        else restoreAddressSearchInput();
      };
      requestAnimationFrame(armWhenReady);
    };
    const chooseAddressSearchStation = (stationName) => {
      const option = findVisiblePopupStationOption(stationName);
      if (option) {
        option.click();
        return;
      }
      if (isGlobalLocale) return;

      input.value = korailDisplayStationName(stationName);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      submit.click();

      let framesRemaining = 60;
      const selectWhenReady = () => {
        if (!popup.isConnected) return;
        const searchedOption = findVisiblePopupStationOption(stationName);
        if (searchedOption) {
          restoreAddressSearchInput();
          searchedOption.click();
        } else if (framesRemaining-- > 0) {
          requestAnimationFrame(selectWhenReady);
        } else {
          restoreAddressSearchInput();
        }
      };
      requestAnimationFrame(selectWhenReady);
    };
    const setSearchInputValue = (value, searchAddress = value) => {
      input.dataset.korailAddressSearch = searchAddress;
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    if (isGlobalLocale) {
      input.addEventListener("input", (event) => {
        if (event.isTrusted) delete input.dataset.korailAddressSearch;
        const query = input.dataset.korailAddressSearch ? "" : input.value.trim().toLowerCase();
        popup.querySelectorAll(".travel-ch_list .ch_tag").forEach((tag) => {
          tag.hidden = Boolean(query) && !tag.textContent.trim().toLowerCase().includes(query);
        });
      });
    }
    const renderResults = (stations, revealPointer = null) => {
      const readyRequest = ++addressResultsReadyRequest;
      stopAddressResultsPointerWait();
      results.hidden = true;
      results.replaceChildren();
      results.classList.toggle("korail-station-address-results--five", stations.length === 5);
      if (!stations.length) return;

      const label = document.createElement("span");
      label.className = "korail-station-address-results__label";
      label.textContent = `${text.top} ${stations.length}`;
      results.appendChild(label);
      const showMajorBadges = includeAllStations.checked;
      const majorBadgeLabel = isGlobalLocale ? "Major" : "주요역";
      const resultItems = [];
      let activeResultItem = null;
      stations.forEach((station, index) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "korail-station-address-results__item";
        const name = document.createElement("strong");
        name.textContent = `${index + 1}. ${korailDisplayStationName(station.name)}`;
        if (showMajorBadges && STATIONS[station.name]?.major === true) {
          const major = document.createElement("span");
          major.className = "korail-station-address-results__major";
          major.textContent = majorBadgeLabel;
          name.append(major);
        }
        const meta = document.createElement("span");
        meta.textContent = `🚗 ${station.durationText} · 📍 ${station.distanceText}`;
        item.append(name, meta);
        const activateItem = (pointerEvent = null) => {
          if (guardedAddressResultItem === item) return;
          if (activeResultItem === item || globalStationSelectionSourceElement === item) return;
          activeResultItem = item;
          highlightMatchedStationMarker(index);
          if (usesHoverStationClick && STATIONS[station.name]?.major === true) {
            armAddressSearchStation(station.name, pointerEvent, item);
          }
        };
        item.addEventListener("mouseenter", activateItem);
        item.addEventListener("mouseleave", () => {
          if (activeResultItem === item) activeResultItem = null;
          addressStationArmRequest += 1;
          resetMatchedStationMarkers();
        });
        item.addEventListener("click", (event) => {
          event.preventDefault();
          if (guardedAddressResultItem === item) {
            event.stopImmediatePropagation();
            return;
          }
          event.stopPropagation();
          if (usesHoverStationClick && STATIONS[station.name]?.major === true) return;
          chooseAddressSearchStation(station.name);
        }, { capture: true });
        results.appendChild(item);
        resultItems.push({ item, activateItem });
      });
      results.hidden = false;
      const pointerGuard = Number.isFinite(revealPointer?.x) && Number.isFinite(revealPointer?.y)
        ? resultItems.find(({ item }) => {
          const rect = item.getBoundingClientRect();
          return revealPointer.x >= rect.left
            && revealPointer.x <= rect.right
            && revealPointer.y >= rect.top
            && revealPointer.y <= rect.bottom;
        })
        : null;
      if (pointerGuard) {
        guardedAddressResultItem = pointerGuard.item;
        guardedAddressResultItem.classList.add("is-pointer-guarded");
        addressResultsPointerMoveHandler = (event) => {
          if (readyRequest !== addressResultsReadyRequest || !popup.isConnected) {
            stopAddressResultsPointerWait();
            return;
          }
          const rect = pointerGuard.item.getBoundingClientRect();
          const movedEnough = Math.hypot(
            event.clientX - revealPointer.x,
            event.clientY - revealPointer.y,
          ) >= 6;
          const leftItem = event.clientX < rect.left
            || event.clientX > rect.right
            || event.clientY < rect.top
            || event.clientY > rect.bottom;
          if (!movedEnough && !leftItem) return;
          stopAddressResultsPointerWait();
          if (!leftItem) pointerGuard.activateItem(event);
        };
        document.addEventListener("pointermove", addressResultsPointerMoveHandler, {
          capture: true,
          passive: true,
        });
        return;
      }
      requestAnimationFrame(() => {
        if (readyRequest !== addressResultsReadyRequest || !popup.isConnected) return;
        resultItems.find(({ item }) => item.matches(":hover"))?.activateItem();
      });
    };
    const matchAddress = async (
      addressValue = input.dataset.korailAddressSearch || input.value,
      revealPointer = null,
    ) => {
      const address = String(addressValue).trim();
      if (!address || isStationSearchValue(address) || stationSearchRow.dataset.busy === "true") return;

      stationSearchRow.dataset.busy = "true";
      submit.disabled = true;
      results.hidden = true;
      try {
        const match = await window.KORAIL_HOME?.findNearestStationMatch?.(address, includeAllStations.checked);
        if (match?.origin && match.stations?.length) {
          const displayAddress = isGlobalLocale ? korailRomanizeHangul(address) : address;
          if (input.value !== displayAddress || input.dataset.korailAddressSearch !== address) {
            setSearchInputValue(displayAddress, address);
          }
          showAddressStationMatch(displayAddress, match.origin, match.stations);
          renderResults(match.stations, revealPointer);
        }
      } catch (error) {
        console.warn("[Korail] Address station matching failed:", error);
      } finally {
        delete stationSearchRow.dataset.busy;
        submit.disabled = false;
      }
    };

    submit.addEventListener("click", (event) => {
      if (isStationSearchValue(input.value)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      matchAddress();
    }, { capture: true });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      event.stopPropagation();
      matchAddress();
    }, { capture: true });
    currentLocation.addEventListener("click", async () => {
      if (currentLocation.disabled) return;
      currentLocation.disabled = true;
      try {
        const address = await window.KORAIL_HOME?.getCurrentLocationAddress?.();
        if (!address) return;
        setSearchInputValue(isGlobalLocale ? korailRomanizeHangul(address) : address, address);
        matchAddress();
      } catch (error) {
        console.warn("[Korail] Current location lookup failed:", error);
      } finally {
        currentLocation.disabled = false;
      }
    });
    historyToggle.addEventListener("click", async () => {
      if (!history.hidden) {
        history.hidden = true;
        historyToggle.setAttribute("aria-expanded", "false");
        return;
      }

      history.hidden = false;
      historyToggle.setAttribute("aria-expanded", "true");
      history.replaceChildren();
      const entries = await window.KORAIL_HOME?.getNearestSearchHistory?.() || [];
      if (!entries.length) {
        const empty = document.createElement("span");
        empty.className = "korail-nearest-history__empty";
        empty.textContent = text.noHistory;
        history.appendChild(empty);
        return;
      }
      entries.forEach((entry) => {
        const displayAddress = isGlobalLocale ? korailRomanizeHangul(entry.address) : entry.address;
        const item = document.createElement("div");
        item.className = "korail-nearest-history__item";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "korail-nearest-history__remove";
        remove.setAttribute("aria-label", isGlobalLocale ? `Remove ${displayAddress} from history` : `${entry.address} 기록 삭제`);
        remove.textContent = "×";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          try {
            await window.KORAIL_HOME?.removeNearestSearchHistory?.(entry.key);
          } catch {
            remove.disabled = false;
            return;
          }
          item.remove();
          if (!history.children.length) {
            const empty = document.createElement("span");
            empty.className = "korail-nearest-history__empty";
            empty.textContent = text.noHistory;
            history.appendChild(empty);
          }
        });
        const select = document.createElement("button");
        select.type = "button";
        select.className = "korail-nearest-history__select";
        select.title = displayAddress;
        const address = document.createElement("span");
        address.className = "korail-nearest-history__address";
        address.textContent = displayAddress;
        const option = document.createElement("span");
        option.className = "korail-nearest-history__option";
        option.textContent = entry.includeAllStations ? text.includeAllStations : text.majorStationsOnly;
        select.append(address, option);
        select.addEventListener("click", (event) => {
          const revealPointer = event.detail > 0
            ? { x: event.clientX, y: event.clientY }
            : null;
          setSearchInputValue(displayAddress, entry.address);
          includeAllStations.checked = entry.includeAllStations === true;
          history.hidden = true;
          historyToggle.setAttribute("aria-expanded", "false");
          matchAddress(undefined, revealPointer);
        });
        item.append(remove, select);
        history.appendChild(item);
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
          if (hoverTrackingEnabled && !a.classList.contains("korail-station-map-native-target")) {
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
  addAddressStationSearch();
  if (usesHoverStationClick) map.on("movestart", restoreGlobalStationOption);

  let tabUpdateFrame = 0;
  const tabObserver = new MutationObserver((records) => {
    const hasRelevantMutation = records.some((record) => {
      const target = record.target?.nodeType === 1 ? record.target : record.target?.parentElement;
      return !target?.closest?.(".korail-station-tracking-toggle, .korail-station-address-search, .leaflet-container");
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
    stopAddressResultsPointerWait();
    restoreGlobalStationOption();
    if (usesHoverStationClick) map.off("movestart", restoreGlobalStationOption);
    if (tabUpdateFrame) cancelAnimationFrame(tabUpdateFrame);
    tabObserver.disconnect();
    map.remove();
  };
}
