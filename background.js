chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.type !== "KORAIL_MAP_API_REQUEST") return false;

  console.info("[Korail Map] API request received:", request.kind);
  handleGoogleApiRequest(request)
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

async function handleGoogleApiRequest(request) {
  if (request.kind === "geocode") {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", request.address);
    url.searchParams.set("region", "kr");
    url.searchParams.set("language", "ko");
    url.searchParams.set("key", request.key);

    const response = await fetch(url.toString());
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_message || `Geocoding API request failed: ${response.status}`);
    }
    return data;
  }

  if (request.kind === "route") {
    const origins = `${request.originLat},${request.originLng}`;
const destinations = request.destinations.map(d => `${d.lat},${d.lng}`).join("|");
const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&mode=driving&language=ko&key=${request.key}`;

    const response = await fetch(url);
    const data = await response.json();
    console.log("[Korail Map] Distance Matrix raw:", JSON.stringify(data));
    if (!response.ok || data.status !== "OK") {
      throw new Error(data.error_message || `Distance Matrix API request failed: ${data.status}`);
    }
    return data;
  }

  throw new Error("Unknown API request.");
}
