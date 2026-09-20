import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.mjs";

test("CARTO tiles are proxied only for Korail pages", async (context) => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl = "";
  globalThis.fetch = async (url) => {
    upstreamUrl = String(url);
    return new Response(new Uint8Array([1]), { headers: { "Content-Type": "image/png" } });
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const allowed = await worker.fetch(new Request("https://proxy.example/v1/tiles/7/109/50.png", {
    headers: { Referer: "https://www.korail.com/ticket" },
  }), { CARTO_BASEMAP_KEY: "test-key" });
  assert.equal(allowed.status, 200);
  assert.match(upstreamUrl, /light_nolabels\/7\/109\/50\.png\?key=test-key$/);

  const forbidden = await worker.fetch(new Request("https://proxy.example/v1/tiles/7/109/50.png", {
    headers: { Referer: "https://example.com/" },
  }), { CARTO_BASEMAP_KEY: "test-key" });
  assert.equal(forbidden.status, 403);
});
