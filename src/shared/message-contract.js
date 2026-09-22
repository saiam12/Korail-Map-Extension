// Message names and validation shared by the content and background boundaries.

((scope) => {
  const TYPES = Object.freeze({
    CURRENT_LOCATION_REQUEST: "KORAIL_CURRENT_LOCATION_REQUEST",
    CURRENT_LOCATION_RESPONSE: "KORAIL_CURRENT_LOCATION_RESPONSE",
    MAP_API_REQUEST: "KORAIL_MAP_API_REQUEST",
    MAP_API_RESPONSE: "KORAIL_MAP_API_RESPONSE",
    NEAREST_CACHE_REQUEST: "KORAIL_NEAREST_CACHE_REQUEST",
    NEAREST_CACHE_RESPONSE: "KORAIL_NEAREST_CACHE_RESPONSE",
    ROUTE_HISTORY_REQUEST: "KORAIL_ROUTE_HISTORY_REQUEST",
    ROUTE_HISTORY_RESPONSE: "KORAIL_ROUTE_HISTORY_RESPONSE",
    SUPPORT_SUBMIT: "KORAIL_SUPPORT_SUBMIT",
    SUPPORT_RESPONSE: "KORAIL_SUPPORT_RESPONSE",
  });

  function isValidPageRequest(request) {
    if (request.type === TYPES.SUPPORT_SUBMIT) {
      const payload = request.payload;
      return payload && typeof payload === "object"
        && ["bug", "suggestion", "other"].includes(payload.category)
        && typeof payload.message === "string" && payload.message.length <= 4000
        && typeof payload.contact === "string" && payload.contact.length <= 200;
    }
    if (request.type !== TYPES.MAP_API_REQUEST) return false;
    if (request.kind === "geocode" || request.kind === "locationGeocode") {
      return typeof request.address === "string" && request.address.length <= 200;
    }
    if (request.kind === "driving" || request.kind === "transit") {
      return [request.startLat, request.startLng, request.goalLat, request.goalLng].every(Number.isFinite);
    }
    if (request.kind === "trainSchedule") {
      return /^\d{8}$/.test(request.runDate || "")
        && /^\d{1,6}$/.test(request.trainNo || "")
        && /^\d{0,6}$/.test(request.trainGroupCode || "");
    }
    return request.kind === "locationReverse"
      && Number.isFinite(request.lat)
      && Number.isFinite(request.lng)
      && (!request.language || ["kor", "eng"].includes(request.language));
  }

  scope.KORAIL_MESSAGE_CONTRACT = { TYPES, isValidPageRequest };
})(globalThis);
