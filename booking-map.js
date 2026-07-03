// 예매 결과 지도와 선택 열차 정차역 표시 기능입니다.

waitForL(() => {
  const { HOME_PANEL_ID, stationName, stationKey, findStationKeyInText } = window.KORAIL_SHARED;
  const { cleanup, cleanupHomeNearestPanel, isLoginPage, updateNearestDisabledState, positionHomeNearestPanel, injectHomeNearestPanel } = window.KORAIL_HOME;

  var isFetchingTrainStations = false;
  var bottomTrainTimeTimer = null;
  var selectedTrainRow = null;
  var selectedTrainRowVersion = 0;
  var selectedTransferRouteKey = "";
  var selectedTransferRouteGroups = new Map();

// 현재 페이지 상태에 맞춰 홈 패널 또는 예매 지도 패널을 초기화합니다.

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


// 예매 결과 목록 옆에 지도 패널을 삽입합니다.


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

// 열차 행 클릭과 하단 열차시각 자동 조회를 연결합니다.

// 하단바 바로 위에 위치한 .tckList 행을 찾습니다.

function getRowAboveBottomBar(bottomBarEl) {
  if (!bottomBarEl) return null;
  const barTop = bottomBarEl.getBoundingClientRect().top;
  const rows = [...document.querySelectorAll(".tckWrap .tckList")];
  // 하단바 위에 있는 행 중 가장 아래(bottom이 barTop에 가장 가까운) 행
  return rows
    .filter((row) => row.getBoundingClientRect().bottom <= barTop + 20)
    .sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
}

// 하단바의 부모 컨테이너를 찾습니다.

function findBottomBarContainer() {
  const timeBtn = findSelectedBottomTrainTimeButton();
  if (!timeBtn) return null;
  // 하단바는 .tckWrap 밖, body 직계 혹은 고정된 컨테이너
  let el = timeBtn.parentElement;
  while (el && el !== document.body) {
    if (!el.closest(".tckWrap")) return el;
    el = el.parentElement;
  }
  return timeBtn.closest("[class]") || null;
}

function bindTrainRowClick(dep, arr) {
  let lastBottomBarKey = "";
  const trainTable = document.querySelector(".tckWrap");
  if (trainTable && !trainTable.dataset.korailBound) {
    trainTable.dataset.korailBound = "1";
    trainTable.addEventListener("click", (event) => {
      const clickedRow = event.target.closest(".tckList");
      if (!clickedRow || !trainTable.contains(clickedRow)) return;
      const transferInfo = getTransferRouteInfo(clickedRow);
      selectedTrainRow = clickedRow;
      selectedTrainRowVersion += 1;
      if (transferInfo.rows.length > 1) {
        selectedTransferRouteKey = transferInfo.key;
        selectedTransferRouteGroups.set(transferInfo.key, transferInfo.rows);
        console.warn("[Korail] selected transfer rows:", transferInfo.rows.map((item) => item.segment));
      } else {
        selectedTransferRouteKey = "";
        selectedTransferRouteGroups.clear();
        console.warn("[Korail] selected direct row:", transferInfo.rows.map((item) => item.segment));
      }
    });
  }

  // 하단바 열차시각 버튼이 나타나는 순간을 감지해 정차역을 가져옵니다.
  const observer = new MutationObserver(() => {
    if (isFetchingTrainStations || document.querySelector(".ReactModal__Content")) return;

    const timeBtn = findSelectedBottomTrainTimeButton();
    if (!timeBtn) return;

    // 버튼 텍스트+위치로 중복 실행 방지
    const btnKey = [
      timeBtn.textContent || "",
      timeBtn.getBoundingClientRect().top,
      selectedTrainRowVersion,
      getSelectedTrainRowKey(),
    ].join("|");
    if (btnKey === lastBottomBarKey) return;
    lastBottomBarKey = btnKey;

    clearTimeout(bottomTrainTimeTimer);
    bottomTrainTimeTimer = setTimeout(() => {
      console.warn("[Korail] 하단바 감지 - type:", getBottomBarInfo().type);
      fetchBottomBarTrainStations(dep, arr);
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
window.fetchTrainStations = fetchTrainStations;

// 문장 안에서 역명을 찾아 반환합니다.

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

// 열차 행에서 출발역과 도착역 구간을 추출합니다.

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

// 열차 행 안의 여러 구간 정보를 추출합니다.

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

function getSelectedTrainRowKey() {
  if (!selectedTrainRow?.isConnected) return "";
  const rows = [...document.querySelectorAll(".tckWrap .tckList")];
  const index = rows.indexOf(selectedTrainRow);
  const segment = getTrainRowSegment(selectedTrainRow);
  return [
    index,
    segment?.dep || "",
    segment?.arr || "",
    (selectedTrainRow.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
  ].join(":");
}

// 환승으로 이어진 열차 행 묶음을 찾습니다.

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

  const result = segments.slice(start, end + 1).map((item) => ({ ...item, segmentIndex: 0 }));
  console.warn("[Korail] getConnectedTrainRows result:", result.map(r => r.segment));
  return result;
}

// 클릭한 행의 환승 묶음 키와 순서를 계산합니다.

function getTransferRouteInfo(clickedRow) {
  const rows = getConnectedTrainRows(clickedRow);
  const index = rows.findIndex((item) => item.row === clickedRow);
  const key = rows
    .map((item) => `${item.segment?.dep || ""}-${item.segment?.arr || ""}`)
    .join("|");
  return { rows, index: Math.max(index, 0), key };
}

// 환승 구간에서 파란색으로 표시할 활성 정차역을 계산합니다.

function getTransferActiveStations(stationNames, segment, transferInfo) {
  if (!stationNames.length) return [];
  if (!segment || transferInfo.rows.length <= 1) return stationNames;

  const isFirst = transferInfo.index === 0;
  const isLast = transferInfo.index === transferInfo.rows.length - 1;
  const from = isFirst ? stationNames[0] : segment.dep;
  const to = isLast ? stationNames.at(-1) : segment.arr;
  const side = isFirst ? "leading" : isLast ? "trailing" : "auto";
  return sliceTrainStations(stationNames, from, to, side);
}

// 지정한 시간만큼 대기하는 Promise를 반환합니다.

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 텍스트나 aria-label로 버튼 또는 링크를 찾습니다.

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

// 열차 행에서 열차시각 버튼을 찾습니다.

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

// 열려 있는 모달을 닫고 사라질 때까지 기다립니다.

function waitModalGone(timeout = 2000) {
  return new Promise((resolve) => {
    if (!document.querySelector(".ReactModal__Content")) { resolve(); return; }
    logInfoGuideModalIfPresent();
    const obs = new MutationObserver(() => {
      logInfoGuideModalIfPresent();
      if (!document.querySelector(".ReactModal__Content")) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(); }, timeout);
    if (!isInfoGuideModal(document.querySelector(".ReactModal__Content"))) {
      document.querySelector(".ReactModal__Content .btn_close")?.click();
    }
  });
}

function isInfoGuideModal(modal) {
  if (!modal) return false;
  const text = modal.textContent || "";
  const hasTrainTable = !!modal.querySelector(".sh-table");
  return text.includes("이용안내") && text.includes("확인") && !hasTrainTable;
}

function logInfoGuideModalIfPresent() {
  const modal = document.querySelector(".ReactModal__Content");
  if (!isInfoGuideModal(modal)) return false;
  if (modal.dataset.korailInfoLogged === "1") return true;
  modal.dataset.korailInfoLogged = "1";
  console.warn("[Korail] 이용안내 팝업 감지됨 - 사용자 확인 전까지 대기합니다.");
  return true;
}

// 열차시각 모달에서 정차역 목록을 추출합니다.

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

// 열차시각 버튼을 열어 정차역 목록을 읽고 닫습니다.

function waitTrainTimeStations(timeBtn) {
  return new Promise((resolve) => {
    if (!timeBtn) { resolve([]); return; }

    const readModal = () => {
      const modal = document.querySelector(".ReactModal__Content");
      if (!modal) return { type: "none" };
      if (logInfoGuideModalIfPresent()) return { type: "guide" };
      const stationNames = extractStopStationsFromTimeModal(modal);
      const unique = [];
      stationNames.forEach((name) => { if (unique.at(-1) !== name) unique.push(name); });
      return unique.length >= 2
        ? { type: "stations", stationNames: unique }
        : { type: "pending" };
    };

    let settled = false;
    let waitingForInfoGuide = false;
    let retriedAfterInfoGuide = false;
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
      if (waitingForInfoGuide && !document.querySelector(".ReactModal__Content")) {
        waitingForInfoGuide = false;
        if (!retriedAfterInfoGuide) {
          retriedAfterInfoGuide = true;
          setTimeout(() => {
            if (!settled) timeBtn.click();
          }, 50);
          return;
        }
      }

      const result = readModal();
      if (result.type === "guide") {
        waitingForInfoGuide = true;
        return;
      }
      if (result.type === "stations") finish(result.stationNames);
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // 이미 열려있으면 즉시 읽기
    const immediate = readModal();
    if (immediate.type === "guide") {
      waitingForInfoGuide = true;
      return;
    }
    if (immediate.type === "stations") { finish(immediate.stationNames); return; }
    if (immediate.type === "none") timeBtn.click();
  });
}

// 전체 정차역 목록에서 선택 구간만 잘라냅니다.

function sliceTrainStations(stationNames, dep, arr, side = "auto") {
  if (!Array.isArray(stationNames) || stationNames.length < 2) return stationNames || [];

  const forwardDepIndex = stationNames.indexOf(dep);
  const forwardArrIndex = forwardDepIndex >= 0
    ? stationNames.findIndex((name, index) => index > forwardDepIndex && name === arr)
    : -1;

  const backwardArrIndex = stationNames.lastIndexOf(arr);
  const backwardDepIndex = backwardArrIndex >= 0
    ? (() => {
        for (let index = backwardArrIndex - 1; index >= 0; index--) {
          if (stationNames[index] === dep) return index;
        }
        return -1;
      })()
    : -1;

  let depIndex = -1;
  let arrIndex = -1;

  if (side === "leading") {
    depIndex = forwardDepIndex;
    arrIndex = forwardArrIndex;
    if (depIndex < 0 || arrIndex < 0) {
      depIndex = backwardDepIndex;
      arrIndex = backwardArrIndex;
    }
  } else if (side === "trailing") {
    depIndex = backwardDepIndex;
    arrIndex = backwardArrIndex;
    if (depIndex < 0 || arrIndex < 0) {
      depIndex = forwardDepIndex;
      arrIndex = forwardArrIndex;
    }
  } else {
    depIndex = forwardDepIndex;
    arrIndex = forwardArrIndex;
    if (depIndex < 0 || arrIndex < 0) {
      depIndex = backwardDepIndex;
      arrIndex = backwardArrIndex;
    }
  }

  if (depIndex < 0 || arrIndex < 0) {
    console.warn("[Korail][active-debug] slice fallback: station not found", {
      dep,
      arr,
      side,
      stationNames,
      forwardDepIndex,
      forwardArrIndex,
      backwardDepIndex,
      backwardArrIndex,
    });
    return stationNames;
  }

  const from = Math.min(depIndex, arrIndex);
  const to = Math.max(depIndex, arrIndex);
  const routeNames = stationNames.slice(from, to + 1);
  const activeStations = depIndex > arrIndex ? routeNames.reverse() : routeNames;
  console.warn("[Korail][active-debug] slice result", {
    dep,
    arr,
    side,
    depIndex,
    arrIndex,
    stationNames,
    activeStations,
  });
  return activeStations;
}

// 모달 조회 실패 시 기본 노선에서 선택 구간 역을 구합니다.

function getFallbackSegmentStations(dep, arr) {
  const result = findRoute(dep, arr);
  if (!result) return [dep, arr].filter((name) => STATIONS[name]);

  const { route, depIdx, arrIdx } = result;
  const routeNames = route.stations.slice(Math.min(depIdx, arrIdx), Math.max(depIdx, arrIdx) + 1);
  return depIdx > arrIdx ? routeNames.reverse() : routeNames;
}

// 모달 조회 실패 시 기본 노선의 전체 역을 구합니다.

function getFallbackRouteStations(dep, arr) {
  const result = findRoute(dep, arr);
  if (!result) return [dep, arr].filter((name) => STATIONS[name]);

  const { route, depIdx, arrIdx } = result;
  const routeNames = [...route.stations];
  return depIdx > arrIdx ? routeNames.reverse() : routeNames;
}

// 정차역 그룹을 지도 위에 회색/파란색 노선으로 그립니다.

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
  const transferMarkerNames = new Set();
  const boundsCoords = [];

  stationGroups.forEach((group) => {
    const rawFullStations = group.fullStations || [];
    const rawActiveStations = group.activeStations || [];
    const fullStations = rawFullStations
      .filter(name => STATIONS[name])
      .map(name => ({ name, ...STATIONS[name] }));
    const normalizedActiveStationNames = normalizeActiveStations(
      fullStations.map((station) => station.name),
      rawActiveStations,
    );
    const activeStations = normalizedActiveStationNames
      .filter(name => STATIONS[name])
      .map(name => ({ name, ...STATIONS[name] }));

    console.warn("[Korail][active-debug] draw group", {
      dep,
      arr,
      rawFullStations,
      rawActiveStations,
      normalizedActiveStations: normalizedActiveStationNames,
      grayStations: fullStations
        .map((station) => station.name)
        .filter((name) => !normalizedActiveStationNames.includes(name)),
    });

    if (fullStations.length < 2) return;

    (group.transferStations || []).forEach((name) => {
      if (name) transferMarkerNames.add(name);
    });

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
    const isTransfer = transferMarkerNames.has(name) && !isDep && !isArr;
    if (activeMarkerNames.has(name)) return;
    const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : "is-gray";
    const isLabel = isDep || isArr;
    const markerSize = isTransfer ? 15 : 7;
    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap ${isLabel ? "is-label" : ""}">
          ${isLabel
          ? `<span class="korail-dot-label ${dotClass}">${stationName(name)}</span>`
          : `<div class="korail-dot ${dotClass}${isTransfer ? " is-transfer" : ""}"></div>`}
              </div>`,
      iconSize: isLabel ? [0, 0] : [markerSize, markerSize],
      iconAnchor: isLabel ? [0, 0] : [markerSize / 2, markerSize / 2],
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
    const isTransfer = transferMarkerNames.has(name) && !isDep && !isArr;
    const dotClass = isDep ? "is-dep" : isArr ? "is-arr" : "is-active";
    const isLabel = isDep || isArr;
    const markerSize = isTransfer ? 15 : 7;
    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap ${isLabel ? "is-label" : ""}">
          ${isLabel
          ? `<span class="korail-dot-label ${dotClass}">${stationName(name)}</span>`
          : `<div class="korail-dot ${dotClass}${isTransfer ? " is-transfer" : ""}"></div>`}
              </div>`,
      iconSize: isLabel ? [0, 0] : [markerSize, markerSize],
      iconAnchor: isLabel ? [0, 0] : [markerSize / 2, markerSize / 2],
    });
    L.marker([coords.lat, coords.lng], { icon })
      .addTo(map)
      .bindTooltip(stationName(name), { permanent: false, direction: "top" });
  });

  map.fitBounds(boundsCoords, { padding: [30, 30] });
}

function normalizeActiveStations(fullStations, activeStations) {
  if (!Array.isArray(fullStations) || !Array.isArray(activeStations) || !fullStations.length || !activeStations.length) {
    return activeStations || [];
  }

  const fullStationNames = new Set(fullStations);
  const normalized = activeStations
    .filter((name) => fullStationNames.has(name));

  const unique = [];
  normalized.forEach((name) => {
    if (unique.at(-1) !== name) unique.push(name);
  });

  return unique;
}

// 버튼이 현재 화면에 보이는지 확인합니다.

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

function isVisibleElement(el) {
  const rect = el?.getBoundingClientRect?.();
  return !!rect
    && rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.right > 0
    && rect.top < window.innerHeight
    && rect.left < window.innerWidth;
}

// 하단 바에서 열차시각 버튼을 찾습니다.

function findBottomTrainTimeButton() {
  return [...document.querySelectorAll("a, button")]
    .filter((el) => {
      const text = (el.textContent || el.getAttribute("aria-label") || "").trim();
      return (text.includes("열차시각") || /Train\s*Time|Time/i.test(text))
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    })
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
}

// 하단바 종류를 판별하고 열차시각 버튼 목록을 반환합니다.
// 환승: .absol 존재 → 선행/후행 버튼 각 1개씩
// 단일: .absol 없음 → 고정 하단바 버튼 1개

function getBottomBarInfo() {
  const absol = [...document.querySelectorAll(".absol")]
    .find((el) => isVisibleElement(el));
  if (absol) {
    const timeBtns = [...absol.querySelectorAll("a, button")]
      .filter((el) => (el.textContent || "").trim().includes("열차시각")
        || /Train\s*Time/i.test(el.textContent || ""))
      .filter(isVisibleButton);
    if (timeBtns.length) return { type: "transfer", timeBtns };
  }
  const btn = [...document.querySelectorAll("a, button")]
    .find((el) => {
      const text = (el.textContent || "").trim();
      return (text.includes("열차시각") || /Train\s*Time/i.test(text))
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    });
  return btn ? { type: "single", timeBtns: [btn] } : { type: "none", timeBtns: [] };
}

// 하단바가 나타날 때까지 기다립니다.

function waitBottomBar(timeout = 3000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      const info = getBottomBarInfo();
      if (info.type !== "none" || Date.now() - startedAt >= timeout) {
        resolve(info);
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

// 선택된 열차의 하단 바 열차시각 버튼을 찾습니다. (기존 호환용)

function findSelectedBottomTrainTimeButton() {
  return getBottomBarInfo().timeBtns[0] || null;
}

// 하단 바 열차시각 버튼이 나타날 때까지 기다립니다. (기존 호환용)

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

// 환승 구간의 fullStations/activeStations 배열들을 환승역 기준으로 병합합니다.

function mergeTransferStationLists(lists) {
  if (!lists.length) return [];
  let merged = [...lists[0]];
  for (let i = 1; i < lists.length; i++) {
    const next = lists[i];
    // 앞 구간의 마지막 역(환승역)이 다음 구간에 있으면 그 위치부터 이어 붙임
    const transferStation = merged.at(-1);
    const overlapIdx = next.indexOf(transferStation);
    if (overlapIdx >= 0) {
      merged = merged.concat(next.slice(overlapIdx + 1));
    } else {
      merged = merged.concat(next);
    }
  }
  return merged;
}

function getTransferStationNames(segments) {
  const transferStations = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const currentArr = segments[i]?.arr;
    const nextDep = segments[i + 1]?.dep;
    if (currentArr && currentArr === nextDep && !transferStations.includes(currentArr)) {
      transferStations.push(currentArr);
    }
  }
  return transferStations;
}

// 행을 클릭한 뒤 하단바가 해당 행 기준으로 갱신될 때까지 기다려 정차역을 읽습니다.

async function fetchStationsViaBottomBar(row, segmentDep, segmentArr) {
  // 현재 하단바 버튼 위치를 기억해두고 변경을 감지합니다.
  const prevBtn = findSelectedBottomTrainTimeButton();
  const prevTop = prevBtn?.getBoundingClientRect().top ?? -1;

  row.click();

  // 하단바가 새 행 기준으로 갱신될 때까지 대기 (버튼 위치 또는 내용 변경 감지)
  await new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const btn = findSelectedBottomTrainTimeButton();
      const top = btn?.getBoundingClientRect().top ?? -1;
      // 버튼이 새로 나타났거나 위치가 바뀌면 갱신된 것으로 판단
      if (btn && top !== prevTop) { resolve(); return; }
      if (Date.now() - started > 2000) { resolve(); return; }
      setTimeout(tick, 80);
    };
    tick();
  });

  const timeBtn = findSelectedBottomTrainTimeButton();
  if (!timeBtn) return [];
  await waitModalGone(300);
  const stationNames = await waitTrainTimeStations(timeBtn);

  // segmentDep/segmentArr 기준으로 방향이 맞는지 확인 후 보정
  if (stationNames.length >= 2 && segmentDep && segmentArr) {
    const depIdx = stationNames.indexOf(segmentDep);
    const arrIdx = stationNames.indexOf(segmentArr);
    // 역방향이면 뒤집기
    if (depIdx > arrIdx && depIdx >= 0 && arrIdx >= 0) {
      stationNames.reverse();
    }
  }

  return stationNames;
}

// 하단 바 열차시각 모달을 열어 정차역을 지도에 반영합니다.
// 단일/환승 여부를 .absol 존재로 판단하고 각각 처리합니다.

async function fetchBottomBarTrainStations(dep, arr) {
  if (isFetchingTrainStations) return;
  isFetchingTrainStations = true;

  try {
    const barInfo = await waitBottomBar(300);
    console.warn("[Korail] barInfo.type:", barInfo.type, "버튼수:", barInfo.timeBtns.length);
    if (barInfo.type === "none") return;

    if (barInfo.type === "single") {
      // 단일 열차
      const [timeBtn] = barInfo.timeBtns;
      await waitModalGone(300);
      const stationNames = await waitTrainTimeStations(timeBtn);
      console.warn("[Korail] 단일 stationNames:", stationNames);
      if (stationNames.length < 2) return;

      const segment = getBottomBarSegment() || getSelectedRowSegment() || { dep, arr };
      const segmentDep = segment.dep || dep;
      const segmentArr = segment.arr || arr;

      drawTrainStations(dep, arr, [{
        fullStations: stationNames,
        activeStations: sliceTrainStations(stationNames, segmentDep, segmentArr, "auto"),
      }]);

    } else {
      // 환승 열차: .absol 안의 버튼 순서 = 선행/후행
      const fullStationsList = [];
      const activeStationsList = [];
      const parsedSegments = getBottomBarTransferSegments();
      const segments = parsedSegments.length ? parsedSegments : getTransferSegmentsFromSelectedRow();
      const transferStations = getTransferStationNames(segments);
      console.warn("[Korail] 환승 segments:", segments);

      for (let i = 0; i < barInfo.timeBtns.length; i++) {
        const timeBtn = barInfo.timeBtns[i];
        await waitModalGone(300);
        const stationNames = await waitTrainTimeStations(timeBtn);
        const segmentDep = segments[i]?.dep || (i === 0 ? dep : segments[i - 1]?.arr || dep);
        const segmentArr = segments[i]?.arr || (i === barInfo.timeBtns.length - 1 ? arr : dep);
        const side = i === 0 ? "leading" : i === barInfo.timeBtns.length - 1 ? "trailing" : "auto";
        const fullStations = stationNames.length >= 2
          ? sliceTrainStations(stationNames, segmentDep, segmentArr, side)
          : getFallbackSegmentStations(segmentDep, segmentArr);
        const activeStations = stationNames.length >= 2
          ? sliceTrainStations(
              stationNames,
              segmentDep,
              segmentArr,
              side,
            )
          : getFallbackSegmentStations(segmentDep, segmentArr);
        console.warn(`[Korail] 구간 ${i + 1} (${segmentDep}→${segmentArr}) 활성역:`, activeStations);
        fullStationsList.push(fullStations);
        activeStationsList.push(activeStations);
      }

      const mergedFull = mergeTransferStationLists(fullStationsList);
      const mergedActive = mergeTransferStationLists(activeStationsList);
      console.warn("[Korail] 병합된 활성역:", mergedActive);

      if (mergedActive.length >= 2) {
        drawTrainStations(dep, arr, [{
          fullStations: mergedFull,
          activeStations: mergedActive,
          transferStations,
        }]);
      }
    }
  } finally {
    isFetchingTrainStations = false;
  }
}

// 단일 열차 하단바에서 구간 정보를 파싱합니다.

function getBottomBarSegment() {
  const bottomBar = findBottomBarContainer();
  if (bottomBar) {
    const seg = parseSegmentFromText(bottomBar.textContent || "");
    if (seg) return seg;
  }

  const containers = [
    bottomBar?.querySelector(".reserv_center"),
    bottomBar?.querySelector(".reserv_wrapbtn"),
  ].filter(Boolean);
  for (const el of containers) {
    const text = el.parentElement?.textContent || el.textContent || "";
    const seg = parseSegmentFromText(text);
    if (seg) return seg;
  }
  return null;
}

function getSelectedRowSegment() {
  if (selectedTrainRow?.isConnected) {
    const segment = getTrainRowSegment(selectedTrainRow);
    if (segment?.dep && segment?.arr) return segment;
  }

  const bottomBar = findBottomBarContainer();
  const rowAboveBottomBar = getRowAboveBottomBar(bottomBar);
  const segment = getTrainRowSegment(rowAboveBottomBar);
  return segment?.dep && segment?.arr ? segment : null;
}

// 환승 하단바(.absol)에서 선행/후행 구간 정보를 파싱합니다.

function getBottomBarTransferSegments() {
  const absol = [...document.querySelectorAll(".absol")]
    .find((el) => isVisibleElement(el));
  if (!absol) return [];
  const sections = [...absol.querySelectorAll(".two01, .one01, [class*='section'], [class*='part']")];
  if (sections.length >= 2) {
    const parsed = sections.map((sec) => parseSegmentFromText(sec.textContent || "")).filter(Boolean);
    if (parsed.length) return parsed;
  }

  // 섹션 구분이 안 되면 absol 전체 텍스트에서 → 기준으로 분리
  const text = absol.textContent || "";
  const arrows = [...text.matchAll(/([^→]+)→([^→]+)/g)];
  return arrows.map((m) => {
    const d = stationKey(findStationKeyInText(m[1]) || findStationInText(m[1]));
    const a = stationKey(findStationKeyInText(m[2]) || findStationInText(m[2]));
    return d && a ? { dep: d, arr: a } : null;
  }).filter(Boolean);
}

// 텍스트에서 출발→도착 구간을 파싱합니다.

function parseSegmentFromText(text) {
  const arrowIdx = (text || "").indexOf("→");
  if (arrowIdx < 0) return null;
  const left = text.slice(0, arrowIdx);
  const right = text.slice(arrowIdx + 1);
  const d = stationKey(findStationKeyInText(left) || findStationInText(left));
  const a = stationKey(findStationKeyInText(right) || findStationInText(right));
  return d && a ? { dep: d, arr: a } : null;
}

function getTransferSegmentsFromSelectedRow() {
  const selectedRows = selectedTransferRouteGroups.get(selectedTransferRouteKey);
  if (selectedRows?.length) {
    const selectedSegments = selectedRows
      .map((item) => item.segment)
      .filter((segment) => segment?.dep && segment?.arr);
    if (selectedSegments.length) {
      console.warn("[Korail] selected row segments:", selectedSegments);
      return selectedSegments;
    }
  }

  const bottomBar = findBottomBarContainer();
  const rowAboveBottomBar = getRowAboveBottomBar(bottomBar);
  if (!rowAboveBottomBar) return [];

  const segments = getConnectedTrainRows(rowAboveBottomBar)
    .map((item) => item.segment)
    .filter((segment) => segment?.dep && segment?.arr);

  console.warn("[Korail] row fallback segments:", segments);
  return segments;
}

// 열차 행 기준으로 정차역을 조회해 지도에 반영합니다.

async function fetchTrainStations(dep, arr, clickedRow) {
  const rows = clickedRow ? getConnectedTrainRows(clickedRow) : [{ row: null, segment: { dep, arr } }];
  const fullStationsList = [];
  const activeStationsList = [];
  const transferStations = getTransferStationNames(
    rows.map((item) => item.segment).filter((segment) => segment?.dep && segment?.arr)
  );

  isFetchingTrainStations = true;
  try {
    for (const item of rows) {
      await waitModalGone(1000);

      const timeBtn = await getTrainTimeButton(item.row, item.segmentIndex);
      const stationNames = await waitTrainTimeStations(timeBtn);

      await waitModalGone(800);

      const segmentDep = item.segment?.dep || dep;
      const segmentArr = item.segment?.arr || arr;
      const side = rows.length > 1
        ? (item === rows[0] ? "leading" : item === rows.at(-1) ? "trailing" : "auto")
        : "auto";
      const fullStations = stationNames.length >= 2
          ? sliceTrainStations(stationNames, segmentDep, segmentArr, side)
          : getFallbackSegmentStations(segmentDep, segmentArr);
      const activeStations = stationNames.length >= 2
        ? sliceTrainStations(
            stationNames,
            segmentDep,
            segmentArr,
            side,
          )
        : getFallbackSegmentStations(segmentDep, segmentArr);

      fullStationsList.push(fullStations);
      activeStationsList.push(activeStations);

      await waitModalGone(500);
    }

    const mergedFull = mergeTransferStationLists(fullStationsList);
    const mergedActive = mergeTransferStationLists(activeStationsList);

    if (mergedActive.length >= 2) {
      drawTrainStations(dep, arr, [{
        fullStations: mergedFull,
        activeStations: mergedActive,
        transferStations,
      }]);
    }
  } finally {
    isFetchingTrainStations = false;
  }
}

}); // waitForL
