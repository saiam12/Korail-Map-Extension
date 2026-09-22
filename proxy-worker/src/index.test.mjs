import assert from "node:assert/strict";
import test from "node:test";

import worker from "./index.mjs";

test("CARTO tile proxy endpoint is not exposed", async () => {
  const response = await worker.fetch(new Request("https://proxy.example/v1/tiles/7/109/50.png"), {});
  assert.equal(response.status, 404);
});
