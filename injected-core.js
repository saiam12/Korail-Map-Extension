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
      nearestTitle: "Find Nearby Major Stations",
      currentLocation: "Based on current location",
      nearestDescription: "Enter an address to find the top 3 nearby major KTX stations.",
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

  const STATION_EN = {
    "서울": "Seoul",
    "용산": "Yongsan",
    "광명": "Gwangmyeong",
    "수서": "Suseo",
    "영등포": "Yeongdeungpo",
    "수원": "Suwon",
    "평택": "Pyeongtaek",
    "평택지제": "PyeongtaekJije",
    "천안아산": "CheonanAsan",
    "천안": "Cheonan",
    "오송": "Osong",
    "조치원": "Jochiwon",
    "대전": "Daejeon",
    "서대전": "Seodaejeon",
    "김천": "Gimcheon",
    "김천구미": "Gimcheon Gumi",
    "구미": "Gumi",
    "동대구": "Dongdaegu",
    "대구": "Daegu",
    "서대구": "Seodaegu",
    "경주": "Gyeongju",
    "울산(통도사)": "Ulsan",
    "태화강": "Taehwagang",
    "포항": "Pohang",
    "경산": "Gyeongsan",
    "밀양": "Miryang",
    "부산": "Busan",
    "구포": "Gupo",
    "창원중앙": "ChangwonJungang",
    "마산": "Masan",
    "진주": "Jinju",
    "평창": "Pyeongchang",
    "진부(오대산)": "Jinbu",
    "강릉": "Gangneung",
    "익산": "Iksan",
    "논산": "Nonsan",
    "전주": "Jeonju",
    "광주송정": "Gwangjusongjeong",
    "목포": "Mokpo",
    "대천": "Daecheon",
    "순천": "Suncheon",
    "청량리": "Cheongnyangni",
    "제천": "Jecheon",
    "여수EXPO": "Yeosu-Expo",
    "동해": "Donghae",
    "정동진": "Jeongdongjin",
    "춘천": "Chuncheon",
    "남춘천": "Namchuncheon",
    "부전": "Bujeon",
    "신탄진": "Sintanjin",
    "영동": "Yeongdong",
    "왜관": "Waegwan",
    "홍성": "Hongseong",
    "안동": "Andong",
    "서원주": "Seowonju",
    "원주": "Wonju",
    "행신": "Haengsin",
    "나주": "Naju",
    "정읍": "Jeongeup",
    "남원": "Namwon",
  };
  // 역명 비교를 위해 공백, 괄호, station 표기를 정규화합니다.
  function normalizeStationLabel(label) {
    return (label || "")
      .trim()
      .toLowerCase()
      .replace(/\bstation\b/g, "")
      .replace(/[\s\-()]/g, "");
  }

  const STATION_KEY_BY_EN = Object.fromEntries(
    Object.entries(STATION_EN).map(([ko, en]) => [normalizeStationLabel(en), ko])
  );

  // 현재 페이지 언어를 감지해 ko 또는 en을 반환합니다.

  function getKorailLocale() {
    const path = location.pathname.toLowerCase();
    if (path.includes("/global/eng/")) return "en";

    const lang = document.documentElement.lang?.toLowerCase() || "";
    if (lang.startsWith("en")) return "en";

    const text = document.body?.innerText || "";
    if (/\b(Departure|Arrival|Search|Station Information|Passenger\(s\)|TICKETS)\b/.test(text)) return "en";
    return "ko";
  }

  // 현재 언어에 맞는 UI 문구를 반환합니다.

  function t(key) {
    const locale = getKorailLocale();
    return TEXT[locale]?.[key] || TEXT.ko[key] || key;
  }

  // 현재 언어에 맞는 역 표시명을 반환합니다.

  function stationName(name) {
    return getKorailLocale() === "en" ? (STATION_EN[name] || name) : name;
  }

  // 영문 또는 표시 역명을 내부 한글 역 키로 변환합니다.

  function stationKey(label) {
    const clean = (label || "").trim();
    if (STATIONS[clean]) return clean;
    return STATION_KEY_BY_EN[normalizeStationLabel(clean)] || clean;
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
    return Object.entries(STATION_EN)
      .map(([name, en]) => {
        const key = normalizeStationLabel(en);
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

  window.KORAIL_SHARED = {
    HOME_PANEL_ID,
    QUICK_MENU_TEXTS,
    TEXT,
    STATION_EN,
    STATION_KEY_BY_EN,
    normalizeStationLabel,
    getKorailLocale,
    t,
    stationName,
    stationKey,
    findStationKeyInText,
    getCurrentStationKey,
  };
  window.KORAIL_I18N = { getLocale: getKorailLocale, t, stationName, stationKey };

}); // waitForL
