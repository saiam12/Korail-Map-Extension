const NAVER_MAPS_BASE_URL = "https://maps.apigw.ntruss.com";
const KAKAO_TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic";

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

function validateRoutePayload(body) {
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

function summarizeTransitSteps(steps) {
  const supportedTypes = new Set(["WALKING", "BUS", "SUBWAY"]);
  return (Array.isArray(steps) ? steps : [])
    .map((step) => {
      const properties = step?.properties || {};
      const type = String(properties.type || "");
      const time = Number(properties.time);
      if (!supportedTypes.has(type) || !Number.isFinite(time) || time <= 0) return null;

      const vehicleNames = [...new Set((Array.isArray(properties.vehicles) ? properties.vehicles : [])
        .map((vehicle) => String(vehicle?.name || "").trim())
        .filter(Boolean)
        .slice(0, 3))];
      return { type, time, vehicleNames };
    })
    .filter(Boolean)
    .slice(0, 20);
}

async function requestKakaoTransit(body, env) {
  const query = new URLSearchParams({
    start_x: String(Number(body.startLng)),
    start_y: String(Number(body.startLat)),
    end_x: String(Number(body.goalLng)),
    end_y: String(Number(body.goalLat)),
    input_coord: "WGS84",
    output_coord: "WGS84",
  });
  const response = await fetch(`${KAKAO_TRANSIT_URL}?${query}`, {
    headers: {
      "Accept": "application/json",
      "Authorization": `KakaoAK ${env.KAKAO_REST_API_KEY}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    return {
      ok: false,
      status: response.ok ? 502 : response.status,
      data: data || { error: "Invalid Kakao Maps response." },
    };
  }

  const unavailableStatuses = new Set(["NO_RESULTS", "STARTNODES_NULL", "ENDNODES_NULL", "EQUAL_POINTS"]);
  if (unavailableStatuses.has(data.status)) {
    return {
      ok: true,
      status: response.status,
      data: { available: false, status: data.status },
    };
  }
  const bestRoute = (Array.isArray(data.routes) ? data.routes : [])
    .map((route) => ({ route, durationSeconds: Number(route?.properties?.totalTime) }))
    .filter(({ durationSeconds }) => Number.isFinite(durationSeconds) && durationSeconds > 0)
    .sort((left, right) => left.durationSeconds - right.durationSeconds)[0];
  if (data.status !== "OK" || !bestRoute) {
    return {
      ok: false,
      status: data.status === "INVALID_REQUEST" ? 400 : 502,
      data: {
        error: "Invalid Kakao Maps transit response.",
        providerStatus: data.status || "UNKNOWN",
      },
    };
  }
  return {
    ok: true,
    status: response.status,
    data: {
      available: true,
      durationSeconds: bestRoute.durationSeconds,
      steps: summarizeTransitSteps(bestRoute.route?.steps),
    },
  };
}

async function requestNaverLocalSearch(query, env) {
  if (!env.NAVER_LOCAL_SEARCH_CLIENT_ID || !env.NAVER_LOCAL_SEARCH_CLIENT_SECRET) return [];
  const url = `https://openapi.naver.com/v1/search/local.json?${new URLSearchParams({ query, display: "1" })}`;
  const response = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": env.NAVER_LOCAL_SEARCH_CLIENT_ID,
      "X-Naver-Client-Secret": env.NAVER_LOCAL_SEARCH_CLIENT_SECRET,
    },
  });
  const data = await response.json().catch(() => null);
  return response.ok && Array.isArray(data?.items) ? data.items : [];
}

function localSearchCoordinates(items) {
  return items
    .map((item) => ({ lat: Number(item.mapy) / 10_000_000, lon: Number(item.mapx) / 10_000_000 }))
    .filter(({ lat, lon }) => isCoordinate(lat, 32, 39) && isCoordinate(lon, 124, 132));
}

function naverReverseAddress(data) {
  const result = data.results?.find((item) => item.name === "roadaddr") || data.results?.[0];
  if (!result) return "";
  const region = ["area1", "area2", "area3", "area4"]
    .map((area) => result.region?.[area]?.name || "")
    .filter(Boolean);
  const land = [result.land?.name, result.land?.number1, result.land?.number2 && `-${result.land.number2}`]
    .filter(Boolean)
    .join(" ")
    .replace(" -", "-");
  return [...region, land].filter(Boolean).join(" ");
}

function naverEnglishAddress(data) {
  const address = data.addresses?.[0];
  return address?.englishAddress || address?.roadAddress || address?.jibunAddress || "";
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
    if (request.method !== "POST" || !["/v1/maps", "/v1/geocode", "/v1/reverse-geocode", "/v1/transit"].includes(pathname)) {
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
    if (pathname === "/v1/transit" && body.kind !== "transit") return json({ error: "Invalid request." }, 400, origin);
    if (pathname === "/v1/maps" && !["geocode", "driving"].includes(body.kind)) return json({ error: "Invalid request." }, 400, origin);

    if (pathname === "/v1/transit" && !env.KAKAO_REST_API_KEY) {
      return json({ error: "Transit proxy is not configured." }, 503, origin);
    }
    if (pathname !== "/v1/transit" && (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET)) {
      return json({ error: "Proxy is not configured." }, 503, origin);
    }

    if (env.MAPS_RATE_LIMITER) {
      const installationId = String(body.installationId || request.headers.get("X-Korail-Installation-Id") || "");
      const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";
      const rateLimitKeys = [`ip:${clientIp}`];
      if (/^[0-9a-f-]{36}$/i.test(installationId)) rateLimitKeys.push(`installation:${installationId}`);
      for (const key of rateLimitKeys) {
        const { success } = await env.MAPS_RATE_LIMITER.limit({ key });
        if (!success) {
          return json(
            { error: "Too many API requests. Please try again in one minute." },
            429,
            origin,
            { "Retry-After": "60" },
          );
        }
      }
    }

    if (pathname === "/v1/transit") {
      if (!validateRoutePayload(body)) return json({ error: "Invalid coordinates." }, 400, origin);
      const result = await requestKakaoTransit(body, env);
      return json(result.data, result.ok ? 200 : result.status, origin);
    }

    let naverUrl;
    if (pathname === "/v1/geocode" || body.kind === "geocode") {
      const address = String(body.address || "").trim();
      if (!address || address.length > 200) return json({ error: "Invalid address." }, 400, origin);
      naverUrl = `${NAVER_MAPS_BASE_URL}/map-geocode/v2/geocode?query=${encodeURIComponent(address)}`;
    } else if (pathname === "/v1/reverse-geocode") {
      if (!isCoordinate(body.lat, 32, 39) || !isCoordinate(body.lng, 124, 132)) return json({ error: "Invalid coordinates." }, 400, origin);
      const query = new URLSearchParams({
        coords: `${Number(body.lng)},${Number(body.lat)}`,
        output: "json",
        orders: "roadaddr,addr",
      });
      naverUrl = `${NAVER_MAPS_BASE_URL}/map-reversegeocode/v2/gc?${query}`;
    } else {
      if (!validateRoutePayload(body)) return json({ error: "Invalid coordinates." }, 400, origin);
      const query = new URLSearchParams({
        start: `${Number(body.startLng)},${Number(body.startLat)}`,
        goal: `${Number(body.goalLng)},${Number(body.goalLat)}`,
        option: "trafast",
      });
      naverUrl = `${NAVER_MAPS_BASE_URL}/map-direction/v1/driving?${query}`;
    }

    const result = await requestNaver(naverUrl, env);
    if (pathname === "/v1/geocode" && result.ok) {
      const addresses = Array.isArray(result.data.addresses) ? result.data.addresses : [];
      if (addresses.length) return json(addresses.map((address) => ({ lat: address.y, lon: address.x })), 200, origin);
      return json(localSearchCoordinates(await requestNaverLocalSearch(String(body.address).trim(), env)), 200, origin);
    }
    if (pathname === "/v1/reverse-geocode" && result.ok) {
      const displayName = naverReverseAddress(result.data);
      if (!displayName) return json({ error: "Reverse geocoding failed." }, 502, origin);
      if (body.language !== "eng") return json({ display_name: displayName }, 200, origin);

      const englishQuery = new URLSearchParams({ query: displayName, language: "eng", count: "1" });
      const englishResult = await requestNaver(`${NAVER_MAPS_BASE_URL}/map-geocode/v2/geocode?${englishQuery}`, env);
      return json({ display_name: naverEnglishAddress(englishResult.data) || displayName }, 200, origin);
    }
    if (result.ok && body.kind === "geocode" && result.data.status !== "OK") {
      return json({ error: result.data.errorMessage || "Geocoding failed." }, 502, origin);
    }
    if (body.kind === "driving" && Number(result.data?.code) >= 1 && Number(result.data?.code) <= 5) {
      return json({ available: false, code: Number(result.data.code) }, 200, origin);
    }
    if (result.ok && body.kind === "driving" && result.data.code !== 0) {
      return json({ error: result.data.message || `Directions failed: code ${result.data.code}` }, 502, origin);
    }
    return json(result.data, result.ok ? 200 : result.status, origin);
  },
};
