// tombstonerun.js：按应用预算应用并留账
import { lastStampOf, removeTomb } from "./store.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function codes(spec) {
  return {
    stale: spec.stale_error_code || "E_STALE_TS",
    nokey: spec.key_error_code || "E_NO_KEY",
    bad: spec.event_error_code || "E_BAD_EVENT"
  };
}

function checkEvent(spec, event) {
  const c = codes(spec);
  if (!event || typeof event !== "object") {
    fail(c.bad, "event is not an object");
  }
  if (event.kind === "put") {
    if (typeof event.key !== "string" || typeof event.ts !== "number"
        || !Object.prototype.hasOwnProperty.call(event, "value")) {
      fail(c.bad, "put needs key, value, ts");
    }
    return;
  }
  if (event.kind === "del") {
    if (typeof event.key !== "string" || typeof event.ts !== "number") {
      fail(c.bad, "del needs key, ts");
    }
    return;
  }
  fail(c.bad, "unknown event kind");
}

// op 是四元组 [kind, key, value, ts]，del 的 value 恒为 0。
// 返回新的墓碑表；entries 原地改。
function applyOp(spec, entries, tombstones, op) {
  const c = codes(spec);
  const kind = op[0];
  const key = op[1];
  const value = op[2];
  const ts = op[3];
  const last = lastStampOf(entries, tombstones, key);
  if (kind === "put") {
    if (ts <= last) {
      fail(c.stale, "put ts " + ts + " not after last op ts " + last);
    }
    entries[key] = [value, ts];
    return removeTomb(tombstones, key);
  }
  if (!Object.prototype.hasOwnProperty.call(entries, key)) {
    fail(c.nokey, "del of unknown key " + key);
  }
  if (ts <= last) {
    fail(c.stale, "del ts " + ts + " not after last op ts " + last);
  }
  delete entries[key];
  const next = tombstones.slice();
  next.push([key, ts]);
  return next;
}

function rowOf(event) {
  return [event.kind, event.key, event.kind === "put" ? event.value : 0, event.ts];
}

export function step(spec) {
  const state = spec.state || { entries: {}, tombstones: [], ledger: [], applied: [] };
  const events = spec.events || [];
  let budget = typeof spec.budget === "number" ? spec.budget : 0;
  const entries = Object.assign({}, state.entries);
  let tombstones = state.tombstones.slice();
  const ledger = state.ledger.slice();
  const appliedIds = new Set(state.applied || []);
  const backlog = ledger.length;
  let applied = 0;
  let judged = 0;

  // 先花预算清了上一轮带上来的账，再处理本轮事件，整批共用一份预算。
  while (ledger.length > 0 && budget > 0) {
    tombstones = applyOp(spec, entries, tombstones, ledger.shift());
    budget -= 1;
    applied += 1;
    judged += 1;
  }

  for (const event of events) {
    if (event && typeof event === "object" && event.id !== undefined
        && appliedIds.has(event.id)) {
      continue;
    }
    checkEvent(spec, event);
    if (event.id !== undefined) {
      appliedIds.add(event.id);
    }
    if (budget > 0) {
      tombstones = applyOp(spec, entries, tombstones, rowOf(event));
      budget -= 1;
      applied += 1;
    } else {
      ledger.push(rowOf(event));
    }
    judged += 1;
  }

  return {
    state: { entries: entries, tombstones: tombstones, ledger: ledger,
             applied: Array.from(appliedIds) },
    applied: applied,
    ledger_before: ledger.length,
    ledger: ledger,
    judged: judged,
    judged_bound: events.length + backlog
  };
}

export function close(spec) {
  const state = spec.state;
  const entries = Object.assign({}, state.entries);
  let tombstones = state.tombstones.slice();
  const ledger = state.ledger.slice();
  let catchup = 0;
  while (ledger.length > 0) {
    tombstones = applyOp(spec, entries, tombstones, ledger.shift());
    catchup += 1;
  }
  return {
    state: { entries: entries, tombstones: tombstones, ledger: ledger,
             applied: (state.applied || []).slice() },
    catchup: catchup
  };
}
