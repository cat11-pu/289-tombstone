import assert from "node:assert";
import { lastStampOf, removeTomb } from "../store.js";
import { step, close } from "../tombstonerun.js";
import { render } from "../app.js";

const base = {
  budget: 2,
  state: { entries: {}, tombstones: [], ledger: [], applied: [] },
  events: [],
  stale_error_code: "E_STALE_TS", key_error_code: "E_NO_KEY",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("lastStampOf returns a number", () => {
  assert.strictEqual(typeof lastStampOf({}, [], "k"), "number");
});

check("removeTomb returns a list", () => {
  assert.ok(Array.isArray(removeTomb([], "k")));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
