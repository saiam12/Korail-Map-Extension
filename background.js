chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.type !== "KORAIL_MAP_API_REQUEST") return false;

  console.info("[Korail Map] API request received:", request.kind);
  handleNaverApiRequest(request)
    .then((data) => {
      console.info("[Korail Map] API request completed:", request.kind, data.status || "OK");
      sendResponse({ ok: true, data });
    })
    .catch((error) => sendResponse({
      ok: false,
      error: `Background fetch failed: ${error.message || "API request failed."}`,
    }));

  return true;
});

async function handleNaverApiRequest(request) {
  console.warn("[Korail Map] request:", {
    kind: request.kind,
    hasClientId: !!request.clientId,
    hasClientSecret: !!request.clientSecret,
    startLat: request.startLat,
    startLng: request.startLng,
    goalLat: request.goalLat,
    goalLng: request.goalLng,
  });
  const headers = {
    "x-ncp-apigw-api-key-id": request.clientId,
    "x-ncp-apigw-api-key": request.clientSecret,
  };

  if (request.kind === "geocode") {
    const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(request.address)}`;
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok || data.status !== "OK") {
      throw new Error(data.errorMessage || `Geocoding 실패: ${response.status}`);
    }
    return data;
  }

  if (request.kind === "driving") {
    validateCoordinate("start", request.startLat, request.startLng);
    validateCoordinate("goal", request.goalLat, request.goalLng);

    const query = `start=${request.startLng},${request.startLat}&goal=${request.goalLng},${request.goalLat}&option=trafast`;
    const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?${query}`;
    const data = await requestJson(url, headers, "Direction 5");
    if (data.code !== 0) {
      throw new Error(data.message || `Directions 실패: code ${data.code}`);
    }
    return data;
  }

  throw new Error("Unknown API request.");
}

async function requestJson(url, headers, label) {
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new Error(`${label} fetch 실패: ${error.name || "Error"} ${error.message || error}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`${label} 응답 파싱 실패: HTTP ${response.status}`);
  }

  if (!response.ok) {
    throw new Error(data.message || data.errorMessage || `${label} HTTP ${response.status}`);
  }

  return data;
}

function validateCoordinate(label, lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
    throw new Error(`${label} 좌표가 올바르지 않습니다: ${lat},${lng}`);
  }
}
