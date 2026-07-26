// 예매 결과 지도와 선택 열차 정차역 표시 기능입니다.

waitForL(() => {
  const {
    HOME_PANEL_ID,
    stationName,
    stationKey,
    findStationKeyInText,
    getCurrentStationKey,
    isVisibleFullMenuOpen,
  } = window.KORAIL_SHARED;
  const { cleanup, cleanupHomeNearestPanel, isLoginPage, updateNearestDisabledState, positionHomeNearestPanel, injectHomeNearestPanel } = window.KORAIL_HOME;

  var selectedTrainRow = null;
  var selectedTrainRowVersion = 0;
  var selectedTrainStationGroups = [];
  var selectedTransferRouteKey = "";
  var selectedTransferSegmentIndexes = new Set();
  var currentBookingDep = "";
  var currentBookingArr = "";
  var userTrainTimeReadVersion = 0;
  var userTrainFareReadVersion = 0;
  var userTrainTimeClickBound = false;
  var userTrainFareClickBound = false;
  var trainRowClickBound = false;
  const trainScheduleCache = new Map();
  const trainFareCache = new Map();
  let trainFareQueue = Promise.resolve();
  let lastTrainFareRequestAt = 0;
  let trainFareLookupsBlocked = false;
  let trainFareRefreshRunning = false;
  let trainFareRefreshRequested = false;
  const isTrainTimeAutomationEnabled = () => true;

  function getStationFields(type) {
    const selectors = type === "dep"
      ? ["#labelstart", "#txtGoStart", ".station_item.n1 span.input", "input[id*='start' i]", "input[name*='start' i]", "input[id*='dep' i]", "input[name*='dep' i]", "a.btn_pop.btn_start"]
      : ["#labelend", "#txtGoEnd", ".station_item.n2 span.input", "input[id*='end' i]", "input[name*='end' i]", "input[id*='arr' i]", "input[name*='arr' i]", "a.btn_pop.btn_end"];

    return [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))];
  }

  function findVisibleStationField(type) {
    if (isGlobalTicketPage()) {
      const globalSelector = type === "dep" ? "a.btn_pop.btn_start" : "a.btn_pop.btn_end";
      const globalField = [...document.querySelectorAll(globalSelector)].find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (globalField) return globalField;
    }
    return getStationFields(type).find((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    }) || null;
  }

  function getStationFieldValue(field) {
    return String(("value" in field && typeof field.value === "string") ? field.value : field.textContent || "").trim();
  }

  function normalizeStationOptionText(value) {
    return String(value || "").replace(/\s+/g, "").toLocaleLowerCase();
  }

  function matchesStationOption(el, stationName) {
    const text = normalizeStationOptionText(el.textContent);
    const name = normalizeStationOptionText(stationName);
    return text === name || text === `${name}station` || text === `${name}역`;
  }

  function findStationPickerByOption(stationName) {
    const matchingNodes = [...document.querySelectorAll("button, a, [role='button'], li, span, strong")]
      .filter((el) => matchesStationOption(el, stationName));

    for (const node of matchingNodes) {
      let container = node.parentElement;
      while (container && container !== document.body) {
        const rect = container.getBoundingClientRect();
        const optionCount = container.querySelectorAll("button, a, [role='button'], li").length;
        const style = getComputedStyle(container);
        const isOverlay = style.position === "fixed"
          || container.matches(".layerWrap, .layer_wrap, [role='dialog'], [class*='popup'], [class*='modal']");
        if (isOverlay && rect.width > 0 && rect.height > 0 && optionCount >= 4) return container;
        container = container.parentElement;
      }
    }
    return null;
  }

  function waitForStationPicker(stationName, timeout = 3000) {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      function findPicker() {
        const optionPicker = findStationPickerByOption(stationName);
        if (optionPicker) return resolve(optionPicker);

        const pickerSelector = ".layerWrap, .layer_wrap, [role='dialog'], [class*='popup'], [class*='modal']";
        const searchInput = [...document.querySelectorAll("input")].find((input) => {
          return /역\s*이름|초성\s*검색|station|search/i.test(input.placeholder || "")
            && input.closest(pickerSelector);
        });
        if (searchInput) {
          const picker = searchInput.closest(pickerSelector);
          if (picker && picker.getBoundingClientRect().width > 0) return resolve(picker);
        }
        if (Date.now() - startedAt >= timeout) return resolve(null);
        requestAnimationFrame(findPicker);
      }
      findPicker();
    });
  }

  function findStationPickerOption(picker, stationName) {
    return [...picker.querySelectorAll("button, a, [role='button'], li, span, strong")]
      .filter((el) => matchesStationOption(el, stationName))
      .map((el) => el.closest("button, a, [role='button'], li") || el)
      .sort((a, b) => Number(!a.matches("button, a, [role='button']")) - Number(!b.matches("button, a, [role='button']")))
      .find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
  }

  async function chooseStationThroughPicker(type, stationName) {
    const selector = type === "dep" ? "a.btn_pop.btn_start" : "a.btn_pop.btn_end";
    const trigger = [...document.querySelectorAll(selector)].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    if (!trigger) return false;

    trigger.click();
    const picker = await waitForStationPicker(stationName);
    const option = picker && findStationPickerOption(picker, stationName);
    if (!option) {
      const closeButton = picker && [...picker.querySelectorAll("button, a")].find((el) => {
        return /close|닫기|×|✕/i.test(`${el.textContent || ""} ${el.getAttribute("aria-label") || ""} ${el.title || ""}`);
      });
      closeButton?.click();
      return false;
    }

    option.click();
    return true;
  }

  async function swapStationsThroughPicker(depField, arrField) {
    const displayedDep = getStationFieldValue(depField);
    const displayedArr = getStationFieldValue(arrField);
    const depKey = getCurrentStationKey("dep") || findStationKeyInText(displayedDep);
    const arrKey = getCurrentStationKey("arr") || findStationKeyInText(displayedArr);
    const depStation = depKey ? stationName(depKey) : displayedDep;
    const arrStation = arrKey ? stationName(arrKey) : displayedArr;
    if (!depStation || !arrStation) return false;

    const departureChanged = await chooseStationThroughPicker("dep", arrStation);
    if (!departureChanged) return false;
    return chooseStationThroughPicker("arr", depStation);
  }

  function shrinkVisibleStartField() {
    const startButton = [...document.querySelectorAll("a.btn_pop.btn_start")].find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    const startField = startButton?.closest(".station_item") || startButton?.parentElement;
    if (startField) startField.classList.add("korail-start-field-short");
  }

  function shiftArrivalLabel(arrField) {
    const arrRect = arrField.getBoundingClientRect();
    const label = [...document.querySelectorAll("label, span, strong, em, p, div")]
      .filter((el) => (el.textContent || "").trim() === "도착역")
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .sort((a, b) => {
        const aRect = a.getBoundingClientRect();
        const bRect = b.getBoundingClientRect();
        return Math.abs(aRect.top - arrRect.top) + Math.abs(aRect.left - arrRect.left)
          - Math.abs(bRect.top - arrRect.top) - Math.abs(bRect.left - arrRect.left);
      })[0];
    if (label) label.classList.add("korail-arrival-label-shift");
  }

  function resetStationFieldAdjustments() {
    document.querySelectorAll(
      ".korail-start-field-short, .korail-arrival-field-shift, .korail-arrival-label-shift, "
        + ".korail-global-departure-field-short, .korail-global-arrival-field-short",
    ).forEach((el) => {
      el.classList.remove(
        "korail-start-field-short",
        "korail-arrival-field-shift",
        "korail-arrival-label-shift",
        "korail-global-departure-field-short",
        "korail-global-arrival-field-short",
      );
      el.style.removeProperty("--korail-global-field-width");
    });
  }

  function adjustGlobalStationFields(depField, arrField) {
    const departureLine = depField.closest(".writeWrap") || depField;
    const arrivalLine = arrField.closest(".writeWrap") || arrField;
    departureLine.classList.add("korail-global-departure-field-short");
    arrivalLine.classList.add("korail-global-arrival-field-short");
  }

  function isStationSwapBlockingPopupOpen() {
    if (isVisibleFullMenuOpen()) return true;

    const selector = [
      ".ReactModal__Content",
      ".layerPopup",
      ".layerWrap",
      ".layer_wrap",
      ".allmenu_Wrap",
      "[role='dialog']",
      "[aria-modal='true']",
    ].join(", ");
    const hasKorailModal = [...document.querySelectorAll(selector)].some((el) => {
      if (el.matches(".event-pop") || el.closest(".event-pop")) return false;
      if (el.closest(`#${HOME_PANEL_ID}, #korail-support-modal, #korail-map-panel, #korail-station-map-popup`)) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0
        && rect.height > 0
        && style.display !== "none"
        && style.visibility !== "hidden"
        && el.getAttribute("aria-hidden") !== "true";
    });
    if (hasKorailModal) return true;

    const visibleTexts = [...document.querySelectorAll("button, a, label, span, p, strong")]
      .filter((el) => {
        if (el.closest(`#${HOME_PANEL_ID}, #korail-support-modal`)) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0
          && rect.height > 0
          && style.display !== "none"
          && style.visibility !== "hidden";
      })
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase());
    const hasAdDismissControl = visibleTexts.some((text) =>
      text.includes("1일간 그만보기")
      || text.includes("오늘 하루 보지 않기")
      || text.includes("하루 동안 보지 않기")
      || text.includes("don't show again today")
      || text.includes("do not show again today")
    );
    const hasAdActions = visibleTexts.some((text) => text === "view details")
      && visibleTexts.some((text) => text === "창닫기" || text === "close");
    return hasAdDismissControl || hasAdActions;
  }

  function syncStationSwapBlockedState() {
    const button = document.getElementById("korail-station-swap-btn");
    if (!button) return;
    const isBlocked = isStationSwapBlockingPopupOpen();
    const isBusy = button.dataset.swapBusy === "true";
    button.classList.toggle("korail-station-swap-btn--blocked", isBlocked);
    button.disabled = isBlocked || isBusy;
  }

  function removeStationSwapButton() {
    document.getElementById("korail-station-swap-btn")?.remove();
    document.querySelectorAll(".korail-station-swap-container")
      .forEach((el) => el.classList.remove("korail-station-swap-container"));
  }

  function calculateStationSwapPlacement(depRect, arrRect, containerRect, buttonSize) {
    const offsetLeft = containerRect?.left || 0;
    const offsetTop = containerRect?.top || 0;
    return {
      left: (depRect.right + arrRect.left) / 2 - offsetLeft - buttonSize / 2,
      top: (depRect.top + depRect.bottom) / 2 - offsetTop - buttonSize / 2,
    };
  }

  function syncStationSwapButton() {
    if (!isStationSwapMainPage() || isLoginPage()) {
      resetStationFieldAdjustments();
      removeStationSwapButton();
      return;
    }

    const isGlobal = isGlobalTicketPage();
    if (isGlobal) resetStationFieldAdjustments();
    else shrinkVisibleStartField();
    let button = document.getElementById("korail-station-swap-btn");
    const depField = findVisibleStationField("dep");
    const arrField = findVisibleStationField("arr");
    if (!depField || !arrField) {
      removeStationSwapButton();
      return;
    }

    if (!button) {
      button = document.createElement("button");
      button.id = "korail-station-swap-btn";
      button.type = "button";
      button.textContent = "⇄";
      document.body.appendChild(button);

      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        const currentDep = findVisibleStationField("dep");
        const currentArr = findVisibleStationField("arr");
        if (!currentDep || !currentArr) return;

        button.dataset.swapBusy = "true";
        button.disabled = true;
        const hideGlobalPicker = isGlobalTicketPage();
        if (hideGlobalPicker) document.documentElement.dataset.korailStationSwap = "true";
        try {
          const swapped = await swapStationsThroughPicker(currentDep, currentArr);
          if (!swapped) return;
          cleanup();
          tryInit();
        } finally {
          if (hideGlobalPicker) delete document.documentElement.dataset.korailStationSwap;
          delete button.dataset.swapBusy;
          syncStationSwapButton();
        }
      });
    }

    const swapLabel = isGlobal ? "Swap departure and arrival" : "출발역과 도착역 바꾸기";
    button.title = swapLabel;
    button.setAttribute("aria-label", swapLabel);
    const swapContainer = depField.closest(".ticketWrap");
    document.querySelectorAll(".korail-station-swap-container")
      .forEach((el) => {
        if (el !== swapContainer) el.classList.remove("korail-station-swap-container");
      });
    if (swapContainer) {
      swapContainer.classList.add("korail-station-swap-container");
      if (button.parentElement !== swapContainer) swapContainer.appendChild(button);
      button.classList.add("korail-station-swap-btn--contained");
    } else {
      if (button.parentElement !== document.body) document.body.appendChild(button);
      button.classList.remove("korail-station-swap-btn--contained");
    }

    if (isGlobal) {
      adjustGlobalStationFields(depField, arrField);
    } else {
      arrField.style.marginLeft = "";
      const arrivalField = arrField.closest(".station_item") || arrField.parentElement;
      if (arrivalField) arrivalField.classList.add("korail-arrival-field-shift");
      shiftArrivalLabel(arrField);
    }
    const depRect = depField.getBoundingClientRect();
    const arrRect = arrField.getBoundingClientRect();
    const containerRect = swapContainer?.getBoundingClientRect();
    const placement = calculateStationSwapPlacement(depRect, arrRect, containerRect, 20);
    button.style.left = `${placement.left}px`;
    button.style.top = `${placement.top}px`;
    button.style.display = "";
    syncStationSwapBlockedState();
  }

function isGlobalTrainRow(el) {
  const text = (el?.textContent || "").replace(/\s+/g, " ");
  const hasRouteAndTime = text.includes("→") && (text.match(/\b\d{1,2}:\d{2}\b/g) || []).length >= 2;
  return hasRouteAndTime && ![...el.children].some((child) => isGlobalTrainRow(child));
}

function getGlobalTrainRows(root = document) {
  if (!location.pathname.includes("/global/")) return [];
  return [...root.querySelectorAll("li, tr, div")].filter(isGlobalTrainRow);
}

function getGlobalTrainTable() {
  const resultTable = [...document.querySelectorAll(".tabPage.active .tckWrap, .tckWrap")]
    .find((table) => getGlobalTrainRows(table).length > 0);
  if (resultTable) return resultTable;

  const rows = getGlobalTrainRows();
  if (!rows.length) return null;

  let table = rows[0].parentElement;
  while (table && !table.contains(rows[1] || rows[0])) table = table.parentElement;
  return table;
}

function isDomesticTrainSearchResultsPage() {
  const path = location.pathname.replace(/\/+$/, "").toLowerCase();
  return path === "/ticket/search/list"
    || path === "/ticket/search/list/discount";
}

function getTrainTable() {
  const domesticTable = isDomesticTrainSearchResultsPage()
    ? document.querySelector(".tckWrap")
    : null;
  if (domesticTable?.querySelector(".tckList .price_box")) {
    return domesticTable;
  }
  return getGlobalTrainTable();
}

function isGlobalTicketPage() {
  return location.pathname.includes("/global/");
}

function isStationSwapMainPage() {
  const path = location.pathname.replace(/\/+$/, "");
  return path === "/ticket/main"
    || /\/global\/(eng|jpn|chn|tw|vi|th|id)\/main$/i.test(path);
}

const TRAIN_TIME_LABELS = [
  "열차시각", "Train Time", "Time", "列車時刻", "列车时刻", "時刻",
  "Giờ tàu", "Giờ khởi hành", "ตารางเวลา", "เวลาเดินรถ", "Jadwal Kereta", "Waktu Kereta",
];
const TRAIN_FARE_LABELS = ["운임요금", "Train Fare", "Fare"];
// const randomNumber = Math.floor(Math.random() * 101) + 100;

function isTrainTimeButton(el) {
  const text = (el?.textContent || el?.getAttribute?.("aria-label") || "").trim().toLocaleLowerCase();
  return TRAIN_TIME_LABELS.some((label) => text.includes(label.toLocaleLowerCase()));
}

function isTrainFareButton(el) {
  const text = (el?.textContent || el?.getAttribute?.("aria-label") || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
  return TRAIN_FARE_LABELS.some((label) => text.includes(label.toLocaleLowerCase()));
}

// 현재 페이지 상태에 맞춰 홈 패널 또는 예매 지도 패널을 초기화합니다.

  function tryInit() {
    if (isLoginPage()) {
      resetStationFieldAdjustments();
      removeStationSwapButton();
      cleanup();
      cleanupHomeNearestPanel();
      return;
    }

    syncStationSwapButton();

  const trainTable = getTrainTable();
  const depEl = document.querySelector("#labelstart");
  const arrEl = document.querySelector("#labelend");
  const displayedSegment = getTrainRowSegment(trainTable);
  const dep = stationKey(depEl?.value.trim() || getCurrentStationKey("dep") || displayedSegment?.dep || "");
  const arr = stationKey(arrEl?.value.trim() || getCurrentStationKey("arr") || displayedSegment?.arr || "");

  // intro 페이지 아닐 때 토글 버튼 제거
  if (!location.pathname.includes("/intro")) {
    document.getElementById("korail-intro-toggle-btn")?.remove();
  }

  // 열차 결과가 없으면 패널 정리 후 종료
  if (!trainTable) {
    cleanup();
    injectHomeNearestPanel();
    return;
  }

  cleanupHomeNearestPanel();

  if (!dep || !arr) return;
  refreshLoadedTransferFares(trainTable);
  const existingPanel = document.getElementById("korail-map-panel");
  if (existingPanel) {
    const segmentChanged = existingPanel.dataset.korailDep !== dep
      || existingPanel.dataset.korailArr !== arr;
    if (!segmentChanged) {
      bindTrainRowClick(dep, arr);
      return;
    }

    selectedTrainRow = null;
    selectedTrainRowVersion += 1;
    selectedTrainStationGroups = [];
    selectedTransferRouteKey = "";
    selectedTransferSegmentIndexes = new Set();
    userTrainTimeReadVersion += 1;
    userTrainFareReadVersion += 1;
    cleanup();
  }

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

function isExtensionMapMutation(record) {
  const target = record?.target?.nodeType === 1
    ? record.target
    : record?.target?.parentElement;
  return !!target?.closest?.("#korail-map-panel, #korail-station-map-popup, .leaflet-container");
}

let tryInitTimer = null;
let spaObserverFrame = null;
const spaObserver = new MutationObserver((records) => {
  const hasRelevantMutation = records.some((record) => !isExtensionMapMutation(record));
  if (!hasRelevantMutation) return;
  if (spaObserverFrame === null) {
    spaObserverFrame = requestAnimationFrame(() => {
      spaObserverFrame = null;
      syncStationSwapBlockedState();
    });
  }
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
  attributeFilter: ["class", "style", "aria-hidden", "hidden"],
});
  window.addEventListener("resize", () => {
  if (isLoginPage()) {
    cleanupHomeNearestPanel();
    return;
  }
    const panel = document.getElementById(HOME_PANEL_ID);
    if (panel) positionHomeNearestPanel(panel);
    syncStationSwapButton();
    updateNearestDisabledState();
});
let homePanelScrollFrame = null;
window.addEventListener("scroll", () => {
  if (homePanelScrollFrame !== null) return;
    homePanelScrollFrame = requestAnimationFrame(() => {
      homePanelScrollFrame = null;
      const panel = document.getElementById(HOME_PANEL_ID);
      if (panel) positionHomeNearestPanel(panel);
      if (!document.querySelector(".korail-station-swap-container")) syncStationSwapButton();
    });
}, { passive: true });
tryInit();


// 예매 결과 목록 옆에 지도 패널을 삽입합니다.


function injectMapPanel(dep, arr, stations, fullRoute) {
  const trainTable = getTrainTable();
  if (!trainTable) return;
  if (document.getElementById("korail-map-panel")) return;
  if (!stations.some((station) => Number.isFinite(station.lat) && Number.isFinite(station.lng))) return;

  const wrapper = document.createElement("div");
  wrapper.id = "korail-map-wrapper";
  wrapper._korailTrainTable = trainTable;
  trainTable.parentNode.insertBefore(wrapper, trainTable);
  wrapper.appendChild(trainTable);

  const panel = document.createElement("div");
  panel.id = "korail-map-panel";
  panel.dataset.korailDep = dep;
  panel.dataset.korailArr = arr;
  wrapper.appendChild(panel);

  renderMap(panel, dep, arr, stations, fullRoute);
  bindTrainRowClick(dep, arr);
}

// 열차 선택을 읽기 전용 정차역 조회와 연결합니다.

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

function getClickedTrainSeatIndex(row, target) {
  const link = target?.closest?.("a");
  const priceBox = target?.closest?.(".price_box");
  if (!link || !priceBox || !row?.contains(priceBox) || !priceBox.contains(link)) return -1;
  return [...row.querySelectorAll(".price_box")].indexOf(priceBox);
}

function getTrainSeatSelectionSignature(rows) {
  return rows.map((item) => [...item.row.querySelectorAll(".price_box")]
    .map((box) => box.classList.contains("active") ? "1" : "0")
    .join(""))
    .join("|");
}

function getConfirmedTransferSegmentIndexes(rows) {
  const indexes = new Set();
  rows.forEach((item, index) => {
    if (item.row?.querySelector(".price_box.active")) indexes.add(index);
  });
  return indexes;
}

function findConfirmedSelectedTrainRow(trainTable) {
  if (!trainTable) return null;
  if (isGlobalTicketPage()) return getRowAboveBottomBar(findBottomBarContainer());
  const activeBoxes = [...trainTable.querySelectorAll(".tckList .price_box.active")];
  return activeBoxes.at(-1)?.closest(".tckList") || null;
}

function bindTrainRowClick(dep, arr) {
  if (currentBookingDep && currentBookingArr
    && (dep !== currentBookingDep || arr !== currentBookingArr)) {
    selectedTransferRouteKey = "";
    selectedTransferSegmentIndexes = new Set();
  }
  currentBookingDep = dep;
  currentBookingArr = arr;

  if (!trainRowClickBound) {
    trainRowClickBound = true;
    document.addEventListener("click", (event) => {
      const trainTable = getTrainTable();
      if (!trainTable) return;
      const clickedRow = event.target.closest(".tckList")
        || (() => {
          let el = event.target;
          while (el && el !== trainTable) {
            if (isGlobalTrainRow(el)) return el;
            el = el.parentElement;
          }
          return null;
        })();
      if (!clickedRow || !trainTable.contains(clickedRow)) return;
      const isGlobal = isGlobalTicketPage();
      const seatIndex = isGlobal ? -1 : getClickedTrainSeatIndex(clickedRow, event.target);
      if (!isGlobal && seatIndex < 0) return;
      const clickedRowKey = getTrainRowKey(clickedRow);
      const previousSelectionSignature = isGlobal
        ? ""
        : getTrainSeatSelectionSignature(getConnectedTrainRows(clickedRow));

      // 코레일의 행 선택 이벤트가 모두 끝난 다음 지도만 갱신합니다.
      setTimeout(() => {
        const liveTable = getTrainTable();
        const liveRows = isGlobal
          ? getGlobalTrainRows(liveTable)
          : [...(liveTable?.querySelectorAll(".tckList") || [])];
        const currentRow = clickedRow.isConnected && liveTable?.contains(clickedRow)
          ? clickedRow
          : liveRows.find((row) => getTrainRowKey(row) === clickedRowKey);
        if (!currentRow || !liveTable?.contains(currentRow)) return;
        if (isGlobal) {
          selectTrainRowForMap(currentRow, currentBookingDep, currentBookingArr);
          return;
        }

        const confirmedRows = getConnectedTrainRows(currentRow);
        const confirmedSelectionSignature = getTrainSeatSelectionSignature(confirmedRows);
        if (confirmedSelectionSignature === previousSelectionSignature) return;
        if (selectConfirmedTrainRowForMap(currentRow, currentBookingDep, currentBookingArr)) return;

        const remainingSelectedRow = findConfirmedSelectedTrainRow(liveTable);
        if (remainingSelectedRow
          && selectConfirmedTrainRowForMap(remainingSelectedRow, currentBookingDep, currentBookingArr)) return;
        resetSelectedTrainMap(currentBookingDep, currentBookingArr);
      }, 0);
    }, true);
  }

  if (!userTrainTimeClickBound) {
    userTrainTimeClickBound = true;
    document.addEventListener("click", (event) => {
      const control = event.target.closest("a, button");
      if (!control || !isTrainTimeButton(control) || !isTrainTimeAutomationEnabled()) return;

      const bottomButtons = getBottomBarInfo().timeBtns;
      const trainTable = getTrainTable();
      if (!bottomButtons.includes(control) && !trainTable?.contains(control)) return;

      const buttonIndex = Math.max(bottomButtons.indexOf(control), 0);
      const readVersion = ++userTrainTimeReadVersion;
      setTimeout(() => {
        updateTrainStationsFromUserTimeModal(buttonIndex, selectedTrainRowVersion, readVersion);
      }, 0);
    }, true);
  }

  if (!userTrainFareClickBound) {
    userTrainFareClickBound = true;
    document.addEventListener("click", (event) => {
      const control = event.target.closest("a, button");
      if (!control || !isTrainFareButton(control) || control.closest(".ReactModal__Content, .layerPopup")) return;

      const fareButtons = findBottomTrainFareButtons();
      const trainTable = getTrainTable();
      if (!fareButtons.includes(control) && !trainTable?.contains(control)) return;

      const readVersion = ++userTrainFareReadVersion;
      setTimeout(() => updateTrainFareFromUserModal(readVersion), 0);
    }, true);
  }

  setTimeout(() => {
    if (selectedTrainRow?.isConnected || !isTrainTimeAutomationEnabled()) return;
    const liveTable = getTrainTable();
    const selectedRow = findConfirmedSelectedTrainRow(liveTable);
    if (selectedRow && liveTable?.contains(selectedRow)) {
      if (isGlobalTicketPage()) {
        selectTrainRowForMap(selectedRow, currentBookingDep, currentBookingArr);
      } else {
        selectConfirmedTrainRowForMap(selectedRow, currentBookingDep, currentBookingArr);
      }
    }
  }, 0);
}

function selectConfirmedTrainRowForMap(clickedRow, dep, arr) {
  const rows = getConnectedTrainRows(clickedRow);
  const confirmedSegmentIndexes = getConfirmedTransferSegmentIndexes(rows);
  if (!confirmedSegmentIndexes.size) return false;
  selectTrainRowForMap(clickedRow, dep, arr, confirmedSegmentIndexes);
  return true;
}

function resetSelectedTrainMap(dep, arr) {
  selectedTrainRow = null;
  selectedTrainRowVersion += 1;
  selectedTransferRouteKey = "";
  selectedTransferSegmentIndexes = new Set();
  selectedTrainStationGroups = [{
    fullStations: getFallbackRouteStations(dep, arr),
    activeStations: getFallbackSegmentStations(dep, arr),
    transferStations: [],
  }];
  if (isTrainTimeAutomationEnabled()) {
    drawTrainStations(dep, arr, selectedTrainStationGroups);
  }
}

function selectTrainRowForMap(clickedRow, dep, arr, confirmedSegmentIndexes = null) {
  const transferInfo = getTransferRouteInfo(clickedRow);
  selectedTransferSegmentIndexes = confirmedSegmentIndexes instanceof Set
    ? new Set([...confirmedSegmentIndexes]
      .filter((index) => index >= 0 && index < transferInfo.rows.length))
    : getNextTransferSelection(
      selectedTransferRouteKey,
      selectedTransferSegmentIndexes,
      transferInfo.key,
      transferInfo.index,
      transferInfo.rows.length,
    );
  selectedTransferRouteKey = transferInfo.key;
  const activeSegmentIndexes = new Set(selectedTransferSegmentIndexes);
  selectedTrainRow = clickedRow;
  selectedTrainRowVersion += 1;
  setSelectedTrainFallback(dep, arr, transferInfo.rows, activeSegmentIndexes);
  if (isTrainTimeAutomationEnabled()) {
    updateSelectedTrainStationsFromSchedule(
      dep,
      arr,
      transferInfo.rows,
      selectedTrainRowVersion,
      activeSegmentIndexes,
    );
  }
}

// 문장 안에서 역명을 찾아 반환합니다.

function findStationInText(text) {
  const translated = stationKey(findStationKeyInText(text));
  if (STATIONS[translated]) return translated;
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

function getTrainRowKey(row) {
  if (!row) return "";
  const rows = [...document.querySelectorAll(".tckWrap .tckList")];
  const index = rows.indexOf(row);
  const segment = getTrainRowSegment(row);
  return [
    index,
    segment?.dep || "",
    segment?.arr || "",
    (row.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
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

  return segments.slice(start, end + 1).map((item) => ({ ...item, segmentIndex: 0 }));
}

// 클릭한 행의 환승 묶음 키와 순서를 계산합니다.

function getTransferRouteInfo(clickedRow) {
  const rows = getConnectedTrainRows(clickedRow);
  const index = rows.findIndex((item) => item.row === clickedRow);
  const allRows = [...document.querySelectorAll(".tckWrap .tckList")];
  const key = rows
    .map((item) => {
      const rowIndex = allRows.indexOf(item.row);
      const trainNumbers = getDisplayedTrainNumbers(item.row);
      const trainNo = trainNumbers[item.segmentIndex || 0] || trainNumbers[0] || "";
      const times = [...String(item.row?.textContent || "").matchAll(/\b\d{1,2}:\d{2}\b/g)]
        .map((match) => match[0])
        .join("-");
      return [
        rowIndex,
        item.segmentIndex || 0,
        item.segment?.dep || "",
        item.segment?.arr || "",
        trainNo,
        times,
      ].join(":");
    })
    .join("|");
  return { rows, index: Math.max(index, 0), key };
}

function getNextTransferSelection(previousKey, previousIndexes, routeKey, clickedIndex, segmentCount) {
  const next = previousKey === routeKey ? new Set(previousIndexes) : new Set();
  [...next].forEach((index) => {
    if (index < 0 || index >= segmentCount) next.delete(index);
  });
  const safeIndex = Math.max(0, Math.min(clickedIndex, Math.max(segmentCount - 1, 0)));
  next.add(safeIndex);
  return next;
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

function extractSegmentFromTimeModal(modal) {
  if (!modal) return null;
  const candidates = [...modal.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, .title, .tit, .head, [class*='title'], [class*='head'], strong, p, div, span"
  )]
    .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
    .filter((text) => text.length <= 120 && (text.match(/→/g) || []).length === 1)
    .sort((a, b) => a.length - b.length);

  for (const text of candidates) {
    const segment = parseSegmentFromText(text);
    if (segment?.dep && segment?.arr) return segment;
  }
  return null;
}

// 사용자가 직접 연 열차시각 모달에서 정차역 목록을 읽습니다.

function waitUserOpenedTrainTimeStations(readVersion) {
  return new Promise((resolve) => {
    const readModal = () => {
      const modal = [...document.querySelectorAll(".ReactModal__Content")]
        .find((element) => element.querySelector(".sh-table"));
      if (!modal) return { type: "none" };
      const stationNames = extractStopStationsFromTimeModal(modal);
      const unique = [];
      stationNames.forEach((name) => { if (unique.at(-1) !== name) unique.push(name); });
      unique.segment = extractSegmentFromTimeModal(modal);
      return unique.length >= 2
        ? { type: "stations", stationNames: unique }
        : { type: "pending" };
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      obs.disconnect();
      clearTimeout(timer);
      resolve(result || []);
    };

    const timer = setTimeout(() => finish([]), 6000);

    const obs = new MutationObserver(() => {
      if (settled) return;
      if (readVersion !== userTrainTimeReadVersion || !isTrainTimeAutomationEnabled()) {
        finish([]);
        return;
      }

      const result = readModal();
      if (result.type === "stations") finish(result.stationNames);
    });
    obs.observe(document.body, { childList: true, characterData: true, subtree: true });

    const immediate = readModal();
    if (immediate.type === "stations") { finish(immediate.stationNames); return; }
  });
}

function extractTrainFareTotalsFromRows(rows) {
  const entries = [];
  let seatName = "";
  (Array.isArray(rows) ? rows : []).forEach((cells) => {
    const normalizedCells = (Array.isArray(cells) ? cells : [])
      .map((cell) => String(cell || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const seatCell = normalizedCells.find((cell) => (
      /일반실|economy|general/i.test(cell) || /특실|우등|first|special/i.test(cell)
    ));
    if (seatCell) {
      seatName = /특실|우등|first|special/i.test(seatCell) ? "특실" : "일반실";
    }
    const totalIndex = normalizedCells.findIndex((cell) => /^(합계|sum|total)$/i.test(cell));
    if (seatName && totalIndex >= 0) {
      entries.push({
        psrmClNm: seatName,
        sumAmt: normalizedCells[totalIndex + 1] || normalizedCells.at(-1) || "",
      });
    }
  });
  return normalizeTrainFareEntries(entries);
}

function extractTrainFareFromModal(modal) {
  if (!modal) return null;
  const rows = [...modal.querySelectorAll("table tr")]
    .map((row) => [...row.querySelectorAll("th, td")].map((cell) => cell.textContent || ""));
  const fares = extractTrainFareTotalsFromRows(rows);
  if (!Object.keys(fares).length) return null;
  const trainNumbers = getDisplayedTrainNumbers({
    innerText: modal.innerText || modal.textContent || "",
    textContent: modal.textContent || "",
  });
  return {
    fares,
    segment: extractSegmentFromTimeModal(modal),
    trainNo: trainNumbers.at(-1) || trainNumbers[0] || "",
  };
}

function waitUserOpenedTrainFare(readVersion) {
  return new Promise((resolve) => {
    const readModal = () => {
      const modal = [...document.querySelectorAll(".ReactModal__Content, .layerPopup, .layerWrap")]
        .find((element) => {
          const text = String(element.textContent || "");
          return element.querySelector("table")
            && /운임요금|Train Fare/i.test(text)
            && isVisibleElement(element);
        });
      return modal ? extractTrainFareFromModal(modal) : null;
    };

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => finish(null), 6000);
    const observer = new MutationObserver(() => {
      if (readVersion !== userTrainFareReadVersion) {
        finish(null);
        return;
      }
      const fare = readModal();
      if (fare) finish(fare);
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    const immediate = readModal();
    if (immediate) finish(immediate);
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
    return getFallbackSegmentStations(dep, arr);
  }

  const from = Math.min(depIndex, arrIndex);
  const to = Math.max(depIndex, arrIndex);
  const routeNames = stationNames.slice(from, to + 1);
  const activeStations = depIndex > arrIndex ? routeNames.reverse() : routeNames;
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

function getCombinedTransferFullStations(
  stationNames,
  segment,
  index,
  segmentCount,
  isCombinedTransfer,
) {
  if (!isCombinedTransfer || segmentCount < 2 || !segment || stationNames.length < 2) {
    return stationNames;
  }
  if (index === 0) {
    return sliceTrainStations(stationNames, stationNames[0], segment.arr, "leading");
  }
  if (index === segmentCount - 1) {
    return sliceTrainStations(stationNames, segment.dep, stationNames.at(-1), "trailing");
  }
  return sliceTrainStations(stationNames, segment.dep, segment.arr);
}

function getSelectedTrainSegments(dep, arr) {
  const segments = (selectedTrainRow ? getConnectedTrainRows(selectedTrainRow) : [])
    .map((item) => item.segment)
    .filter((segment) => segment?.dep && segment?.arr);
  return segments.length ? segments : [{ dep, arr }];
}

function buildFallbackTrainStationGroups(
  dep,
  arr,
  rows = null,
  activeSegmentIndexes = selectedTransferSegmentIndexes,
) {
  const segments = rows?.length
    ? rows.map((item) => item.segment || { dep, arr })
    : getSelectedTrainSegments(dep, arr);
  const transferStations = getTransferStationNames(segments);
  const isCombinedTransfer = segments.length > 1
    && segments.every((_, index) => activeSegmentIndexes.has(index));
  return segments.map((segment, index) => {
    if (!activeSegmentIndexes.has(index)) {
      return { fullStations: [], activeStations: [], transferStations };
    }
    const fullStations = getFallbackRouteStations(segment.dep, segment.arr);
    return {
      fullStations: getCombinedTransferFullStations(
        fullStations,
        segment,
        index,
        segments.length,
        isCombinedTransfer,
      ),
      activeStations: getFallbackSegmentStations(segment.dep, segment.arr),
      transferStations,
    };
  });
}

function setSelectedTrainFallback(dep, arr, rows, activeSegmentIndexes) {
  selectedTrainStationGroups = buildFallbackTrainStationGroups(
    dep,
    arr,
    rows,
    activeSegmentIndexes,
  );
  if (isTrainTimeAutomationEnabled() && selectedTrainStationGroups.length) {
    drawTrainStations(dep, arr, selectedTrainStationGroups);
  }
}

function normalizeTrainRunDate(value) {
  const text = String(value || "");
  const compact = text.match(/20\d{6}/)?.[0];
  if (compact) return compact;
  const separated = text.match(/(20\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!separated) return "";
  return `${separated[1]}${separated[2].padStart(2, "0")}${separated[3].padStart(2, "0")}`;
}

function normalizeTrainNumber(value) {
  const trainNo = String(value || "").trim();
  if (!/^\d{1,6}$/.test(trainNo)) return "";
  return trainNo.replace(/^0+(?=\d)/, "");
}

function normalizeTrainScheduleMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const trainNo = normalizeTrainNumber(value.h_trn_no ?? value.trnNo ?? value.txtTrnNo ?? "");
  if (!trainNo) return null;
  return {
    trainNo,
    runDate: normalizeTrainRunDate(
      value.h_run_dt ?? value.runDt ?? value.txtRunDt ?? value.h_dpt_dt ?? value.dptDt,
    ),
    trainGroupCode: String(
      value.h_trn_gp_cd ?? value.trnGpCd ?? value.txtTrnGpCd ?? value.h_trn_clsf_cd ?? "00",
    ).replace(/\D/g, "").slice(0, 6) || "00",
  };
}

function scanTrainRowReactValues(row, visitor) {
  const visited = new Set();

  const scanProps = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 5 || visited.size >= 500 || visited.has(value)) return;
    visited.add(value);
    visitor(value);

    if (Array.isArray(value)) {
      value.slice(0, 50).forEach((item) => scanProps(item, depth + 1));
      return;
    }
    Object.keys(value).slice(0, 80).forEach((key) => {
      if (["children", "_owner", "ref", "stateNode", "return", "child", "sibling"].includes(key)) return;
      scanProps(value[key], depth + 1);
    });
  };

  let node = row;
  for (let ancestorDepth = 0; node && ancestorDepth < 3; ancestorDepth++, node = node.parentElement) {
    Object.keys(node)
      .filter((key) => key.startsWith("__react"))
      .forEach((key) => {
        const reactValue = node[key];
        if (reactValue?.memoizedProps) {
          let fiber = reactValue;
          for (let fiberDepth = 0; fiber && fiberDepth < 10; fiberDepth++, fiber = fiber.return) {
            scanProps(fiber.memoizedProps);
            scanProps(fiber.pendingProps);
            scanProps(fiber.memoizedState);
            scanProps(fiber.stateNode?.props);
            scanProps(fiber.stateNode?.state);
          }
        } else {
          scanProps(reactValue);
        }
      });
  }
}

function collectTrainScheduleMetadataFromReact(row) {
  const results = [];
  const resultKeys = new Set();
  scanTrainRowReactValues(row, (value) => {
    const metadata = normalizeTrainScheduleMetadata(value);
    if (!metadata) return;
    const key = `${metadata.runDate}:${metadata.trainNo}:${metadata.trainGroupCode}`;
    if (resultKeys.has(key)) return;
    resultKeys.add(key);
    results.push(metadata);
  });
  return results;
}

function getDisplayedTrainNumbers(row) {
  const lines = String(row?.innerText || row?.textContent || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numbers = lines
    .filter((line) => /^\d{1,6}$/.test(line))
    .concat(lines.flatMap((line) => [...line.matchAll(/(?:KTX|ITX|무궁화|누리로|SRT|S-?train|남도해양열차)[^\d]{0,12}(\d{1,6})/gi)]
      .map((match) => match[1])))
    .map(normalizeTrainNumber)
    .filter(Boolean);
  return [...new Set(numbers)];
}

function getDisplayedTrainRunDate(row, metadata) {
  const selectors = [
    "#txtGoAbrdDt",
    "input[name='txtGoAbrdDt']",
    "input[id*='AbrdDt' i]",
    "input[name*='AbrdDt' i]",
    "input[type='date']",
  ];
  const values = [
    ...selectors.flatMap((selector) => [...document.querySelectorAll(selector)]),
    row,
  ].map((element) => element?.value || element?.textContent || "");
  const displayedDate = values.map(normalizeTrainRunDate).find(Boolean);
  if (displayedDate) return displayedDate;
  const metadataDates = [...new Set(metadata.map((item) => item.runDate).filter(Boolean))];
  return metadataDates.length === 1 ? metadataDates[0] : "";
}

function getTrainScheduleMetadata(row, segmentIndex = 0) {
  const metadata = collectTrainScheduleMetadataFromReact(row);
  const displayedNumbers = getDisplayedTrainNumbers(row);
  let trainNo = displayedNumbers[segmentIndex] || displayedNumbers[0] || "";
  if (!trainNo) {
    const metadataTrainNumbers = [...new Set(metadata.map((item) => item.trainNo).filter(Boolean))];
    if (metadataTrainNumbers.length !== 1) return null;
    [trainNo] = metadataTrainNumbers;
  }

  const matchingMetadata = metadata.filter((item) => item.trainNo === trainNo);
  const selected = matchingMetadata.find((item) => item.runDate) || matchingMetadata[0] || null;
  const runDate = selected?.runDate || getDisplayedTrainRunDate(row, matchingMetadata.length ? matchingMetadata : metadata);
  if (!/^\d{8}$/.test(runDate) || !/^\d{1,6}$/.test(trainNo)) return null;
  return {
    runDate,
    trainNo,
    trainGroupCode: selected?.trainGroupCode || "00",
  };
}

function normalizeTrainFareMetadata(value) {
  if (!value || typeof value !== "object") return null;
  const trainNo = normalizeTrainNumber(value.h_trn_no ?? value.trnNo ?? value.txtTrnNo ?? "");
  const departureStationCode = String(
    value.h_dpt_rs_stn_cd ?? value.dptRsStnCd ?? value.txtDptRsStnCd ?? "",
  ).trim();
  const arrivalStationCode = String(
    value.h_arv_rs_stn_cd ?? value.arvRsStnCd ?? value.txtArvRsStnCd ?? "",
  ).trim();
  if (!trainNo
    || !/^[A-Za-z0-9]{2,10}$/.test(departureStationCode)
    || !/^[A-Za-z0-9]{2,10}$/.test(arrivalStationCode)) return null;

  const seatAttributeCode = String(
    value.h_seat_att_cd ?? value.seatAttCd ?? value.rqSeatAttCd ?? value.txtSeatAttCd_4 ?? "015",
  ).trim();
  return {
    runDate: normalizeTrainRunDate(
      value.h_run_dt ?? value.runDt ?? value.txtRunDt ?? value.h_dpt_dt ?? value.dptDt,
    ),
    trainNo,
    departureStationCode,
    arrivalStationCode,
    departureStationName: String(
      value.h_dpt_rs_stn_nm ?? value.dptRsStnNm ?? value.txtGoStart ?? "",
    ).trim(),
    arrivalStationName: String(
      value.h_arv_rs_stn_nm ?? value.arvRsStnNm ?? value.txtGoEnd ?? "",
    ).trim(),
    seatAttributeCode: /^[A-Za-z0-9]{3}$/.test(seatAttributeCode) ? seatAttributeCode : "015",
  };
}

function collectTrainFareMetadataFromReact(row) {
  const results = [];
  const resultKeys = new Set();
  scanTrainRowReactValues(row, (value) => {
    const metadata = normalizeTrainFareMetadata(value);
    if (!metadata) return;
    const key = [
      metadata.runDate,
      metadata.trainNo,
      metadata.departureStationCode,
      metadata.arrivalStationCode,
      metadata.seatAttributeCode,
    ].join(":");
    if (resultKeys.has(key)) return;
    resultKeys.add(key);
    results.push(metadata);
  });
  return results;
}

function getTrainFareMetadata(row, segmentIndex = 0) {
  const metadata = collectTrainFareMetadataFromReact(row);
  const displayedNumbers = getDisplayedTrainNumbers(row);
  let trainNo = displayedNumbers[segmentIndex] || displayedNumbers[0] || "";
  if (!trainNo) {
    const metadataTrainNumbers = [...new Set(metadata.map((item) => item.trainNo).filter(Boolean))];
    if (metadataTrainNumbers.length !== 1) return null;
    [trainNo] = metadataTrainNumbers;
  }

  const segment = getTrainRowSegments(row)[segmentIndex] || null;
  const matchingMetadata = metadata.filter((item) => item.trainNo === trainNo);
  const selected = matchingMetadata.find((item) => {
    if (!segment || !item.departureStationName || !item.arrivalStationName) return false;
    return stationKey(item.departureStationName) === segment.dep
      && stationKey(item.arrivalStationName) === segment.arr;
  }) || matchingMetadata.find((item) => item.runDate) || matchingMetadata[0] || null;
  const runDate = selected?.runDate || getDisplayedTrainRunDate(row, matchingMetadata);
  if (!selected || !/^\d{8}$/.test(runDate)) return null;
  return { ...selected, runDate, trainNo };
}

function normalizeTrainFareEntries(entries) {
  const fares = {};
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const digits = String(entry?.sumAmt ?? "").replace(/\D/g, "");
    if (!digits) return;
    const amount = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "원";
    const seatName = String(entry?.psrmClNm || "");
    if (/특실|우등|first|special/i.test(seatName)) {
      fares.special = amount;
    } else if (!fares.general) {
      fares.general = amount;
    }
  });
  return fares;
}

function getTrainFareCacheKey(metadata) {
  return [
    metadata.runDate,
    metadata.trainNo,
    metadata.departureStationCode,
    metadata.arrivalStationCode,
    metadata.seatAttributeCode,
  ].join(":");
}

function requestTrainFare(metadata) {
  const cacheKey = getTrainFareCacheKey(metadata);
  if (trainFareCache.has(cacheKey)) return trainFareCache.get(cacheKey);

  const request = trainFareQueue.then(async () => {
    if (trainFareLookupsBlocked) return null;
    const remainingDelay = 250 - (Date.now() - lastTrainFareRequestAt);
    if (remainingDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, remainingDelay));
    }
    lastTrainFareRequestAt = Date.now();

    const formData = new FormData();
    formData.append("chtnDvCd", "1");
    formData.append("menuId", "11");
    formData.append("dptRsStnCd", metadata.departureStationCode);
    formData.append("arvRsStnCd", metadata.arrivalStationCode);
    formData.append("runDt", metadata.runDate);
    formData.append("trnNo", metadata.trainNo.padStart(5, "0"));
    formData.append("rqSeatAttCd", metadata.seatAttributeCode);
    formData.append("Device", "BH");
    formData.append("Version", "999999999");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch("/classes/com.korail.mobile.trn.prcFare.do", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (data?.errCode === "macro_err1") {
        trainFareLookupsBlocked = true;
        return null;
      }
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) trainFareLookupsBlocked = true;
        return null;
      }
      const fares = normalizeTrainFareEntries(data?.prcList);
      return Object.keys(fares).length ? fares : null;
    } catch (error) {
      trainFareLookupsBlocked = true;
      console.warn("[Korail Map] Automatic fare lookup stopped; keeping the original result layout:", error);
      return null;
    } finally {
      clearTimeout(timer);
    }
  });
  trainFareQueue = request.then(() => undefined);
  trainFareCache.set(cacheKey, request);
  return request;
}

function getLoadedTransferFareItems(trainTable) {
  const rows = [...trainTable.querySelectorAll(".tckList")];
  const handledRows = new Set();
  const items = [];
  rows.forEach((row) => {
    if (handledRows.has(row)) return;
    const connected = getConnectedTrainRows(row)
      .filter((item) => trainTable.contains(item.row));
    if (connected.length < 2) return;
    connected.forEach((item) => {
      handledRows.add(item.row);
      items.push(item);
    });
  });
  return items;
}

function getTrainFareSegmentBoxes(item) {
  const boxes = [...item.row.querySelectorAll(".price_box")];
  const segments = getTrainRowSegments(item.row);
  if (segments.length <= 1) return boxes;
  const boxesPerSegment = Math.floor(boxes.length / segments.length);
  if (boxesPerSegment < 1) return [];
  const start = (item.segmentIndex || 0) * boxesPerSegment;
  return boxes.slice(start, start + boxesPerSegment);
}

function isSoldOutTrainFareBox(box) {
  const soldOutClasses = ["sold_out", "sold_out_wait", "sold_out_seat", "yms_sold_out", "lack_seat"];
  if (soldOutClasses.some((className) => box.classList.contains(className))) return true;
  return /매진(?!\s*임박)|sold\s*out(?!\s*soon)/i.test(String(box.textContent || ""));
}

function renderTrainFareBoxes(item, fares, fareKey) {
  getTrainFareSegmentBoxes(item).slice(0, 2).forEach((box, index) => {
    if (isSoldOutTrainFareBox(box)) return;
    const anchor = box.querySelector("a");
    if (!anchor) return;
    const seatLabel = anchor.querySelector(".txt_ch")?.textContent || "";
    const fareType = /특실|우등|first|special/i.test(seatLabel)
      ? "special"
      : index === 1 ? "special" : "general";
    const amount = fares?.[fareType];
    if (!amount) return;

    let label = anchor.querySelector(".txt_ch");
    if (!label) {
      label = document.createElement("p");
      label.className = "txt_ch";
      label.textContent = fareType === "special" ? "특실" : "일반실";
      anchor.prepend(label);
    }
    let price = anchor.querySelector(".txt_price");
    const rewardText = [
      anchor.querySelector(".txt_gr")?.textContent,
      price?.textContent,
    ].find((text) => /적립/.test(text || "")) || "";
    if (!price) {
      price = document.createElement("p");
      price.className = "txt_price txt_bk";
      label.after(price);
    }
    price.textContent = amount;
    if (rewardText) {
      let reward = anchor.querySelector(".txt_gr");
      if (!reward) {
        reward = document.createElement("p");
        reward.className = "txt_gr";
        anchor.append(reward);
      }
      reward.textContent = rewardText.trim();
    }
    box.dataset.korailFareKey = fareKey;
  });
}

function refreshLoadedTransferFares(trainTable) {
  if (!isDomesticTrainSearchResultsPage() || !trainTable || trainFareLookupsBlocked) return;
  trainFareRefreshRequested = true;
  if (trainFareRefreshRunning) return;
  trainFareRefreshRunning = true;

  (async () => {
    let currentTable = trainTable;
    do {
      trainFareRefreshRequested = false;
      const items = getLoadedTransferFareItems(currentTable);
      for (const item of items) {
        if (trainFareLookupsBlocked || !item.row.isConnected) break;
        const metadata = getTrainFareMetadata(item.row, item.segmentIndex || 0);
        if (!metadata) continue;
        const fareKey = getTrainFareCacheKey(metadata);
        const boxes = getTrainFareSegmentBoxes(item);
        const availableBoxes = boxes.slice(0, 2)
          .filter((box) => !isSoldOutTrainFareBox(box) && box.querySelector("a"));
        if (!availableBoxes.length) continue;
        if (availableBoxes.some((box) => box.dataset.korailFareKey)) continue;
        const fares = await requestTrainFare(metadata);
        if (fares && item.row.isConnected) renderTrainFareBoxes(item, fares, fareKey);
      }
      currentTable = getTrainTable();
    } while (trainFareRefreshRequested
      && currentTable
      && isDomesticTrainSearchResultsPage()
      && !trainFareLookupsBlocked);
  })().finally(() => {
    trainFareRefreshRunning = false;
    if (trainFareRefreshRequested && !trainFareLookupsBlocked) {
      refreshLoadedTransferFares(getTrainTable());
    }
  });
}

function requestTrainSchedule(metadata) {
  const cacheKey = `${metadata.runDate}:${metadata.trainNo}:${metadata.trainGroupCode}`;
  if (trainScheduleCache.has(cacheKey)) return trainScheduleCache.get(cacheKey);

  const request = new Promise((resolve, reject) => {
    const requestId = `korail-train-schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = setTimeout(() => {
      window.removeEventListener("message", handleResponse);
      reject(new Error("Train schedule request timed out."));
    }, 8000);
    const handleResponse = (event) => {
      const response = event.data;
      if (event.source !== window
        || response?.type !== "KORAIL_MAP_API_RESPONSE"
        || response.requestId !== requestId) return;
      clearTimeout(timer);
      window.removeEventListener("message", handleResponse);
      if (!response.ok || !Array.isArray(response.data?.stations)) {
        reject(new Error(response.error || "Train schedule request failed."));
        return;
      }
      const stationNames = [];
      response.data.stations.forEach((label) => {
        const name = stationKey(label);
        if (STATIONS[name] && stationNames.at(-1) !== name) stationNames.push(name);
      });
      resolve(stationNames);
    };
    window.addEventListener("message", handleResponse);
    window.postMessage({
      type: "KORAIL_MAP_API_REQUEST",
      kind: "trainSchedule",
      requestId,
      ...metadata,
    }, "*");
  });
  trainScheduleCache.set(cacheKey, request);
  request.catch(() => trainScheduleCache.delete(cacheKey));
  return request;
}

async function updateSelectedTrainStationsFromSchedule(
  dep,
  arr,
  rows,
  requestVersion,
  activeSegmentIndexes,
) {
  const segments = rows.map((item) => item.segment || { dep, arr });
  const transferStations = getTransferStationNames(segments);
  const isCombinedTransfer = rows.length > 1
    && rows.every((_, index) => activeSegmentIndexes.has(index));
  const groups = await Promise.all(rows.map(async (item, index) => {
    const segment = item.segment || { dep, arr };
    if (!activeSegmentIndexes.has(index)) {
      return { fullStations: [], activeStations: [], transferStations };
    }
    const fallbackRoute = getFallbackRouteStations(segment.dep, segment.arr);
    const fallbackSegment = getFallbackSegmentStations(segment.dep, segment.arr);
    const fallbackFullStations = getCombinedTransferFullStations(
      fallbackRoute,
      segment,
      index,
      rows.length,
      isCombinedTransfer,
    );
    const metadata = getTrainScheduleMetadata(item.row, item.segmentIndex || 0);
    if (!metadata) {
      return {
        fullStations: fallbackFullStations,
        activeStations: fallbackSegment,
        transferStations,
      };
    }

    try {
      const stationNames = await requestTrainSchedule(metadata);
      if (stationNames.length < 2) throw new Error("Train schedule has no stations.");
      const side = rows.length > 1
        ? (index === 0 ? "leading" : index === rows.length - 1 ? "trailing" : "auto")
        : "auto";
      const segmentStations = sliceTrainStations(stationNames, segment.dep, segment.arr, side);
      return {
        fullStations: getCombinedTransferFullStations(
          stationNames,
          segment,
          index,
          rows.length,
          isCombinedTransfer,
        ),
        activeStations: segmentStations,
        transferStations,
      };
    } catch (error) {
      console.warn("[Korail Map] Train schedule lookup failed; using local route:", error);
      return {
        fullStations: fallbackFullStations,
        activeStations: fallbackSegment,
        transferStations,
      };
    }
  }));

  if (requestVersion !== selectedTrainRowVersion
    || dep !== currentBookingDep
    || arr !== currentBookingArr
    || !isTrainTimeAutomationEnabled()) return;
  selectedTrainStationGroups = groups;
  drawTrainStations(dep, arr, selectedTrainStationGroups);
}

async function updateTrainStationsFromUserTimeModal(buttonIndex, requestVersion, readVersion) {
  const dep = currentBookingDep;
  const arr = currentBookingArr;
  const stationNames = await waitUserOpenedTrainTimeStations(readVersion);
  if (stationNames.length < 2
    || requestVersion !== selectedTrainRowVersion
    || readVersion !== userTrainTimeReadVersion
    || dep !== currentBookingDep
    || arr !== currentBookingArr
    || !isTrainTimeAutomationEnabled()) return;

  const segments = getSelectedTrainSegments(dep, arr);
  const modalSegment = stationNames.segment;
  let groupIndex = modalSegment
    ? segments.findIndex((segment) => segment.dep === modalSegment.dep && segment.arr === modalSegment.arr)
    : -1;
  if (groupIndex < 0) groupIndex = Math.min(buttonIndex, segments.length - 1);

  const segment = modalSegment || segments[groupIndex] || { dep, arr };
  const side = segments.length > 1
    ? (groupIndex === 0 ? "leading" : groupIndex === segments.length - 1 ? "trailing" : "auto")
    : "auto";
  const activeStations = sliceTrainStations(stationNames, segment.dep, segment.arr, side);
  const fullStations = stationNames;
  const transferStations = getTransferStationNames(segments);

  if (selectedTrainStationGroups.length !== segments.length) {
    selectedTrainStationGroups = buildFallbackTrainStationGroups(dep, arr);
  }
  selectedTrainStationGroups[groupIndex] = {
    fullStations,
    activeStations,
    transferStations,
  };
  drawTrainStations(dep, arr, selectedTrainStationGroups);
}

async function updateTrainFareFromUserModal(readVersion) {
  const modalFare = await waitUserOpenedTrainFare(readVersion);
  if (!modalFare
    || readVersion !== userTrainFareReadVersion
    || !isDomesticTrainSearchResultsPage()) return;

  const trainTable = getTrainTable();
  if (!trainTable) return;
  const items = getLoadedTransferFareItems(trainTable);
  const matchesSegment = (item) => !modalFare.segment
    || (item.segment?.dep === modalFare.segment.dep && item.segment?.arr === modalFare.segment.arr);
  const matchesTrain = (item) => {
    if (!modalFare.trainNo) return true;
    const trainNumbers = getDisplayedTrainNumbers(item.row);
    return (trainNumbers[item.segmentIndex || 0] || trainNumbers[0] || "") === modalFare.trainNo;
  };
  const item = items.find((candidate) => matchesSegment(candidate) && matchesTrain(candidate))
    || items.find(matchesSegment);
  if (!item?.row?.isConnected) return;

  const fareKey = [
    "modal",
    modalFare.trainNo,
    modalFare.segment?.dep || item.segment?.dep || "",
    modalFare.segment?.arr || item.segment?.arr || "",
  ].join(":");
  renderTrainFareBoxes(item, modalFare.fares, fareKey);
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
    if (activeMarkerNames.has(name)) return;
    const isTransfer = transferMarkerNames.has(name);
    const markerSize = isTransfer ? 15 : 7;
    const icon = L.divIcon({
      className: "",
      html: `<div class="korail-dot-wrap"><div class="korail-dot is-gray${isTransfer ? " is-transfer" : ""}"></div></div>`,
      iconSize: [markerSize, markerSize],
      iconAnchor: [markerSize / 2, markerSize / 2],
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
      return isTrainTimeButton(el)
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    })
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] || null;
}

function findBottomTrainFareButtons() {
  return [...document.querySelectorAll("a, button")]
    .filter((el) => isTrainFareButton(el)
      && !el.closest(".tckWrap")
      && !el.closest(".ReactModal__Content, .layerPopup")
      && isVisibleButton(el));
}

// 하단바 종류를 판별하고 열차시각 버튼 목록을 반환합니다.
// 환승: .absol 존재 → 선행/후행 버튼 각 1개씩
// 단일: .absol 없음 → 고정 하단바 버튼 1개

function getBottomBarInfo() {
  const absol = [...document.querySelectorAll(".absol")]
    .find((el) => isVisibleElement(el));
  if (absol) {
    const timeBtns = [...absol.querySelectorAll("a, button")]
      .filter(isTrainTimeButton)
      .filter(isVisibleButton);
    if (timeBtns.length) return { type: "transfer", timeBtns };
  }
  const btn = [...document.querySelectorAll("a, button")]
    .find((el) => {
      return isTrainTimeButton(el)
        && !el.closest(".tckWrap")
        && !el.closest(".ReactModal__Content")
        && isVisibleButton(el);
    });
  return btn ? { type: "single", timeBtns: [btn] } : { type: "none", timeBtns: [] };
}

// 선택된 열차의 하단 바 열차시각 버튼을 찾습니다. (기존 호환용)

function findSelectedBottomTrainTimeButton() {
  return getBottomBarInfo().timeBtns[0] || null;
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

}); // waitForL
