const NAVER_MAPS_BASE_URL = "https://maps.apigw.ntruss.com";
const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";

function json(data, status = 200, origin = "", extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders,
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

function allowedExtensionIds(env) {
  return String(env.ALLOWED_EXTENSION_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function extensionIdFromOrigin(origin) {
  const match = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin || "");
  return match?.[1] || "";
}

function isCoordinate(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

function validateDrivingPayload(body) {
  const coordinates = [
    [body.startLat, 32, 39],
    [body.startLng, 124, 132],
    [body.goalLat, 32, 39],
    [body.goalLng, 124, 132],
  ];
  return coordinates.every(([value, min, max]) => isCoordinate(value, min, max));
}

async function requestNaver(url, env) {
  const response = await fetch(url, {
    headers: {
      "x-ncp-apigw-api-key-id": env.NAVER_CLIENT_ID,
      "x-ncp-apigw-api-key": env.NAVER_CLIENT_SECRET,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    return { ok: false, status: response.status, data: data || { error: "Invalid Naver Maps response." } };
  }
  return { ok: true, status: response.status, data };
}

async function requestNominatim(url, privacyPolicyUrl) {
  const cache = caches.default;
  const cached = await cache.match(url);
  if (cached) return { ok: true, status: 200, data: await cached.json() };
  const response = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": `KorailMapExtension/1.0 (${privacyPolicyUrl})`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    return { ok: false, status: response.status, data: data || { error: "Invalid geocoding response." } };
  }
  await cache.put(url, new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  }));
  return { ok: true, status: response.status, data };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const configuredIds = allowedExtensionIds(env);
    const originExtensionId = extensionIdFromOrigin(origin);

    if (request.method === "OPTIONS") {
      if (!originExtensionId || !configuredIds.includes(originExtensionId)) {
        return json({ error: "Forbidden." }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Korail-Extension-Id",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        },
      });
    }

    const pathname = new URL(request.url).pathname;
    if (request.method !== "POST" || !["/v1/maps", "/v1/geocode", "/v1/reverse-geocode"].includes(pathname)) {
      return json({ error: "Not found." }, 404, origin);
    }
    const extensionId = request.headers.get("X-Korail-Extension-Id") || "";
    if (!configuredIds.includes(extensionId) || (originExtensionId && originExtensionId !== extensionId)) {
      return json({ error: "Forbidden." }, 403, origin);
    }
    if (Number(request.headers.get("Content-Length") || 0) > 4096) {
      return json({ error: "Request is too large." }, 413, origin);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return json({ error: "Invalid request." }, 400, origin);
    }

    if (pathname === "/v1/geocode" && body.kind !== "locationGeocode") return json({ error: "Invalid request." }, 400, origin);
    if (pathname === "/v1/reverse-geocode" && body.kind !== "locationReverse") return json({ error: "Invalid request." }, 400, origin);
    if (pathname === "/v1/maps" && !["geocode", "driving"].includes(body.kind)) return json({ error: "Invalid request." }, 400, origin);

    if (pathname !== "/v1/maps") {
      const privacyPolicyUrl = String(env.PRIVACY_POLICY_URL || "");
      if (!privacyPolicyUrl.startsWith("https://")) return json({ error: "Privacy policy URL is not configured." }, 503, origin);
      if (!env.GEOCODE_RATE_LIMITER) return json({ error: "Geocoding rate limiter is not configured." }, 503, origin);

      if (pathname === "/v1/geocode") {
        const address = String(body.address || "").trim();
        if (!address || address.length > 200) return json({ error: "Invalid address." }, 400, origin);
        const url = `${NOMINATIM_BASE_URL}/search?${new URLSearchParams({ q: address, format: "json", limit: "1", countrycodes: "kr" })}`;
        const cached = await caches.default.match(url);
        if (cached) return json(await cached.json(), 200, origin);
        const { success } = await env.GEOCODE_RATE_LIMITER.limit({ key: "nominatim-global" });
        if (!success) return json({ error: "Geocoding is busy. Please try again shortly." }, 429, origin, { "Retry-After": "1" });
        const result = await requestNominatim(url, privacyPolicyUrl);
        return json(result.data, result.ok ? 200 : result.status, origin);
      }

      if (!isCoordinate(body.lat, 32, 39) || !isCoordinate(body.lng, 124, 132)) return json({ error: "Invalid coordinates." }, 400, origin);
      const url = `${NOMINATIM_BASE_URL}/reverse?${new URLSearchParams({ lat: String(body.lat), lon: String(body.lng), format: "json", zoom: "18" })}`;
      const cached = await caches.default.match(url);
      if (cached) return json(await cached.json(), 200, origin);
      const { success } = await env.GEOCODE_RATE_LIMITER.limit({ key: "nominatim-global" });
      if (!success) return json({ error: "Geocoding is busy. Please try again shortly." }, 429, origin, { "Retry-After": "1" });
      const result = await requestNominatim(url, privacyPolicyUrl);
      return json(result.data, result.ok ? 200 : result.status, origin);
    }

    if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
      return json({ error: "Proxy is not configured." }, 503, origin);
    }

    if (env.MAPS_RATE_LIMITER) {
      const installationId = String(body.installationId || request.headers.get("X-Korail-Installation-Id") || "");
      const clientKey = /^[0-9a-f-]{36}$/i.test(installationId)
        ? installationId
        : request.headers.get("CF-Connecting-IP") || "unknown";
      const { success } = await env.MAPS_RATE_LIMITER.limit({ key: clientKey });
      if (!success) {
        return json(
          { error: "Too many API requests. Please try again in one minute." },
          429,
          origin,
          { "Retry-After": "60" },
        );
      }
    }

    let naverUrl;
    if (body.kind === "geocode") {
      const address = String(body.address || "").trim();
      if (!address || address.length > 200) return json({ error: "Invalid address." }, 400, origin);
      naverUrl = `${NAVER_MAPS_BASE_URL}/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;
    } else {
      if (!validateDrivingPayload(body)) return json({ error: "Invalid coordinates." }, 400, origin);
      const query = new URLSearchParams({
        start: `${Number(body.startLng)},${Number(body.startLat)}`,
        goal: `${Number(body.goalLng)},${Number(body.goalLat)}`,
        option: "trafast",
      });
      naverUrl = `${NAVER_MAPS_BASE_URL}/map-direction/v1/driving?${query}`;
    }

    const result = await requestNaver(naverUrl, env);
    if (result.ok && body.kind === "geocode" && result.data.status !== "OK") {
      return json({ error: result.data.errorMessage || "Geocoding failed." }, 502, origin);
    }
    if (result.ok && body.kind === "driving" && result.data.code !== 0) {
      return json({ error: result.data.message || `Directions failed: code ${result.data.code}` }, 502, origin);
    }
    return json(result.data, result.ok ? 200 : result.status, origin);
  },
};
