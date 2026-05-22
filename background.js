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
  console.warn("[Korail Map] request:", JSON.stringify(request));
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
    const url = `https://maps.apigw.ntruss.com/map-direction/v1/driving?start=${request.startLng},${request.startLat}&goal=${request.goalLng},${request.goalLat}&option=trafast`;
    const response = await fetch(url, { headers });
    const data = await response.json();
    if (!response.ok || data.code !== 0) {
      throw new Error(data.message || `Directions 실패: ${response.status}`);
    }
    return data;
  }

  throw new Error("Unknown API request.");
}
