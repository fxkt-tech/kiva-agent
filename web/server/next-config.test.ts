import assert from "node:assert/strict";
import { it } from "node:test";
import config from "../next.config";

it("does not let the optional development badge cover workspace controls", () => {
  assert.equal(config.reactStrictMode, true);
  assert.equal(config.devIndicators, false);
});
