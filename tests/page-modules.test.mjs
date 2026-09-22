import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadPageModule(path) {
  const context = { window: {}, console };
  vm.runInNewContext(readFileSync(path, "utf8"), context, { filename: path });
  return context.window;
}

test("shared message contract validates requests at the extension boundary", () => {
  const context = {};
  vm.runInNewContext(readFileSync("src/shared/message-contract.js", "utf8"), context);
  const { TYPES, isValidPageRequest } = context.KORAIL_MESSAGE_CONTRACT;

  assert.equal(TYPES.MAP_API_REQUEST, "KORAIL_MAP_API_REQUEST");
  assert.equal(isValidPageRequest({
    type: TYPES.MAP_API_REQUEST,
    kind: "trainSchedule",
    runDate: "20260922",
    trainNo: "42",
    trainGroupCode: "00",
  }), true);
  assert.equal(isValidPageRequest({
    type: TYPES.MAP_API_REQUEST,
    kind: "driving",
    startLat: "37.5",
    startLng: 127,
    goalLat: 36,
    goalLng: 128,
  }), false);
});

test("background maps client exposes one request boundary", () => {
  const context = {
    self: {},
    chrome: { runtime: { id: "extension-id" }, storage: { local: {} } },
    console,
    crypto,
    fetch,
    URL,
  };
  vm.runInNewContext(readFileSync("src/background/maps-client.js", "utf8"), context);
  assert.deepEqual(Object.keys(context.self.KORAIL_MAPS_CLIENT), ["request"]);
});

test("booking schedule metadata is normalized", () => {
  const { KORAIL_BOOKING_SCHEDULE: schedule } = loadPageModule("src/page/booking/train-schedule.js");

  assert.equal(schedule.normalizeTrainRunDate("2026-09-22"), "20260922");
  assert.equal(schedule.normalizeTrainNumber("00042"), "42");
  const metadata = schedule.normalizeTrainScheduleMetadata({
    h_trn_no: "00042",
    h_run_dt: "2026.09.22",
    h_trn_gp_cd: "KTX-12",
  });
  assert.equal(metadata.trainNo, "42");
  assert.equal(metadata.runDate, "20260922");
  assert.equal(metadata.trainGroupCode, "12");
});

test("booking fares preserve Korail rounding and labels", () => {
  const { KORAIL_BOOKING_FARE: fare } = loadPageModule("src/page/booking/train-fare.js");

  const entries = fare.normalizeTrainFareEntries([
    { psrmClNm: "일반실", sumAmt: "13500" },
    { psrmClNm: "특실", sumAmt: "21000" },
  ]);
  assert.equal(entries.general, "13,500원");
  assert.equal(entries.special, "21,000원");
  assert.equal(fare.calculateStandingTrainFare("13,500원"), "11,500원");
  assert.equal(fare.calculateTransferTrainFare("13,500원", false), "9,400원");
});

test("home location service filters stations and formats cached results", () => {
  const { KORAIL_HOME_LOCATION_SERVICE: locationModule } = loadPageModule("src/page/home/location-service.js");
  const service = locationModule.create({
    stations: {
      Seoul: { lat: 37.5547, lng: 126.9706, major: true },
      Yongsan: { lat: 37.5298, lng: 126.9648, major: false },
    },
    isKoreanLocale: () => true,
    t: (key) => key,
  });

  const nearest = service.getNearestByDistance({ lat: 37.55, lng: 126.97 }, 3);
  assert.equal(nearest.length, 1);
  assert.equal(nearest[0].name, "Seoul");
  assert.match(nearest[0].distanceText, /^(?:\d+m|\d+\.\dkm)$/);
  const [cached] = service.formatCachedNearestResults([{
    durationSeconds: 3660,
    transitDurationSeconds: 600,
    distanceMeters: 1200,
  }]);
  assert.equal(cached.durationText, "1시간 1분");
  assert.equal(cached.transitDurationText, "10분");
  assert.equal(cached.distanceText, "1.2km");
});

test("home route service sorts without mutating the input", () => {
  const { KORAIL_HOME_ROUTE_SERVICE: routeModule } = loadPageModule("src/page/home/route-service.js");
  const service = routeModule.create({
    requestMapsApi: async () => ({}),
    geocodeAddress: async () => ({ lat: 0, lng: 0 }),
    formatDistance: (value) => String(value),
    formatDuration: (value) => String(value),
    t: (key) => key,
  });
  const stations = [
    { name: "B", durationSeconds: 200, transitDurationSeconds: 100, straightDistanceMeters: 20 },
    { name: "A", durationSeconds: 100, transitDurationSeconds: 300, straightDistanceMeters: 10 },
  ];

  assert.deepEqual(service.sortNearestResults(stations, "driving").map(({ name }) => name), ["A", "B"]);
  assert.deepEqual(service.sortNearestResults(stations, "transit").map(({ name }) => name), ["B", "A"]);
  assert.deepEqual(stations.map(({ name }) => name), ["B", "A"]);
});

test("page modules are injected before their controllers", () => {
  const content = readFileSync("src/content/content.js", "utf8");
  const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
  const resources = manifest.web_accessible_resources[0].resources;
  const expectedModules = [
    "src/page/home/location-service.js",
    "src/page/home/route-service.js",
    "src/page/booking/station-picker.js",
    "src/page/booking/train-schedule.js",
    "src/page/booking/train-fare.js",
  ];

  expectedModules.forEach((path) => {
    assert.match(content, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(resources.includes(path));
  });
  assert.ok(content.indexOf("src/page/home/route-service.js") < content.indexOf("src/page/home-panel.js"));
  assert.ok(content.indexOf("src/page/booking/train-fare.js") < content.indexOf("src/page/booking-map.js"));
});
