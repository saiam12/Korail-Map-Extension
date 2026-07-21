// 페이지 컨텍스트에서 실행됩니다. Leaflet, STATIONS, renderMap 모두 사용 가능합니다.

window.injectHomeFeature = window.injectHomeFeature || function noopKorailHomeFeature() {};

// L이 정의될 때까지 대기 (혹시 로드 타이밍 차이가 있을 경우 대비)
// Leaflet이 준비될 때까지 기다린 뒤 콜백을 실행합니다.
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
      nearestDescription: "주소를 입력하면 가까운 KTX 주요역을 찾아줍니다.",
      departureLocation: "출발 위치",
      addressPlaceholder: "예: 서울시청, 대구 수성구",
      search: "검색",
      result: "조회 결과",
      searchAfterAddress: "주소 입력 후 검색",
      includeAllStations: "일반역 포함",
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
      nearestTitle: "Find Nearby Stations",
      currentLocation: "Based on current location",
      nearestDescription: "Enter an address to find nearby major KTX stations.",
      departureLocation: "Departure location",
      addressPlaceholder: "e.g. Seoul City Hall, Suseong-gu Daegu",
      search: "Search",
      result: "Search Results",
      searchAfterAddress: "Search after entering an address",
      includeAllStations: "Include all stations",
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

  TEXT.ko.useCurrentLocation = "내 위치";
  TEXT.ko.locating = "위치 확인 중…";
  TEXT.ko.locationUnavailable = "현재 위치를 가져올 수 없습니다. 위치 권한을 확인해주세요.";
  TEXT.en.useCurrentLocation = "My location";
  TEXT.en.locating = "Locating…";
  TEXT.en.locationUnavailable = "Unable to get your current location. Check location permission.";

  const stationTranslationModule = window.KORAIL_STATION_TRANSLATIONS || {};
  const STATION_TRANSLATIONS = stationTranslationModule.STATION_TRANSLATIONS || {};
  const getStationTranslationMap = stationTranslationModule.getStationTranslationMap || ((locale) => STATION_TRANSLATIONS[locale] || {});
  const STATION_EN = getStationTranslationMap("en", STATIONS);
  const STATION_DISPLAY_NAMES = {
    en: STATION_EN,
    jpn: getStationTranslationMap("jpn", STATIONS),
    chn: getStationTranslationMap("chn", STATIONS),
    tw: STATION_EN,
  };
  // 역명 비교를 위해 공백, 괄호, station 표기를 정규화합니다.
  function normalizeStationLabel(label) {
    return (label || "")
      .trim()
      .toLowerCase()
      .replace(/\bstation\b/g, "")
      .replace(/(エキスポ|世界博览会|世界博覽會)/g, "expo")
      .replace(/乌致院/g, "鸟致院")
      .replace(/京山/g, "庆山")
      .replace(/松亭/g, "松汀")
      .replace(/[龜龟]/g, "亀")
      .replace(/(车站|車站|역|駅|站)/g, "")
      .replace(/[\s\-()]/g, "");
  }

  const STATION_KEY_BY_LABEL = Object.fromEntries(
    [
      ...Object.keys(STATIONS).map((name) => [name, name]),
      ...Object.values(STATION_DISPLAY_NAMES).flatMap((map) => Object.entries(map || {})),
    ]
      .map(([ko, label]) => [normalizeStationLabel(label), ko])
  );
  const STATION_KEY_BY_EN = Object.fromEntries(
    Object.entries(STATION_EN).map(([ko, en]) => [normalizeStationLabel(en), ko])
  );

  // 현재 페이지 언어를 감지합니다. UI 문구가 없는 언어는 영어 문구를 fallback으로 사용합니다.

  function getKorailLocale() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/global/jpn/")) return "jpn";
    if (path.includes("/global/chn/")) return "chn";
    if (path.includes("/global/tw/")) return "tw";
    if (/\/global\/(eng|vi|th|id)\//.test(path)) return "en";

    const lang = document.documentElement.lang?.toLowerCase() || "";
    if (lang.startsWith("en")) return "en";

    const text = document.body?.innerText || "";
    if (/\b(Departure|Arrival|Search|Station Information|Passenger\(s\)|TICKETS)\b/.test(text)) return "en";
    return "ko";
  }

  // 현재 언어에 맞는 UI 문구를 반환합니다.

  function t(key) {
    const locale = getKorailLocale();
    return TEXT[locale]?.[key] || TEXT.en[key] || TEXT.ko[key] || key;
  }

  // 현재 언어에 맞는 역 표시명을 반환합니다.

  function stationName(name) {
    const locale = getKorailLocale();
    if (locale === "ko") return name;
    return STATION_DISPLAY_NAMES[locale]?.[name] || STATION_EN[name] || name;
  }

  // 영문 또는 표시 역명을 내부 한글 역 키로 변환합니다.

  function stationKey(label) {
    const clean = (label || "").trim();
    if (STATIONS[clean]) return clean;
    return STATION_KEY_BY_LABEL[normalizeStationLabel(clean)] || clean;
  }

  // 문장 안에서 알려진 역명을 찾아 내부 역 키로 반환합니다.

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
    return Object.values(STATION_DISPLAY_NAMES)
      .flatMap((map) => Object.entries(map || {}))
      .map(([name, label]) => {
        const key = normalizeStationLabel(label);
        const index = normalized.lastIndexOf(key);
        return { name, index, end: index + key.length };
      })
      .filter((item) => item.index >= 0)
      .sort((a, b) => b.end - a.end || b.name.length - a.name.length)[0]?.name || "";
  }

  // 현재 검색 폼의 출발역 또는 도착역 키를 읽습니다.

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

  // 한글/글로벌 사이트의 전체메뉴는 화면마다 클래스명이 달라질 수 있어
  // 알려진 클래스와 실제로 펼쳐진 메뉴 제목/크기를 함께 확인합니다.
  function isVisibleFullMenuOpen() {
    const isVisibleLargeMenu = (el) => {
      if (!el || el === document.body || el === document.documentElement) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width >= Math.min(280, window.innerWidth * 0.3)
        && rect.height >= Math.min(160, window.innerHeight * 0.22)
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < window.innerWidth
        && rect.top < window.innerHeight
        && style.display !== "none"
        && style.visibility !== "hidden"
        && Number.parseFloat(style.opacity || "1") > 0
        && el.getAttribute("aria-hidden") !== "true";
    };

    const menuSelectors = [
      ".allmenu_Wrap",
      ".allMenuWrap",
      ".all_menu_wrap",
      ".all-menu-wrap",
      ".fullMenu",
      ".full-menu",
      ".full_menu",
      "[class*='allmenu' i]",
      "[id*='allmenu' i]",
      "[class*='fullmenu' i]",
      "[id*='fullmenu' i]",
    ].join(", ");
    if ([...document.querySelectorAll(menuSelectors)].some(isVisibleLargeMenu)) return true;

    const titlePattern = /^(full\s*menu|전체\s*메뉴)$/i;
    return [...document.querySelectorAll("h1, h2, h3, h4, strong, span, p, div")]
      .some((el) => {
        if (!titlePattern.test((el.textContent || "").replace(/\s+/g, " ").trim())) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width >= 40
          && rect.height >= 15
          && rect.right > 0
          && rect.bottom > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight
          && style.display !== "none"
          && style.visibility !== "hidden";
      });
  }

  window.KORAIL_SHARED = {
    HOME_PANEL_ID,
    QUICK_MENU_TEXTS,
    TEXT,
    STATION_TRANSLATIONS,
    STATION_EN,
    STATION_DISPLAY_NAMES,
    STATION_KEY_BY_EN,
    STATION_KEY_BY_LABEL,
    normalizeStationLabel,
    getKorailLocale,
    t,
    stationName,
    stationKey,
    findStationKeyInText,
    getCurrentStationKey,
    isVisibleFullMenuOpen,
  };
  window.KORAIL_I18N = { getLocale: getKorailLocale, t, stationName, stationKey };

}); // waitForL
