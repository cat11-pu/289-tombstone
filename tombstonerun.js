// tombstonerun.js：按应用预算应用并留账，收尾不限预算补齐
import { lastStampOf, removeTomb } from "./store.js";

function code(spec, name, fallback) {
  const value = spec[name];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function failure(spec, name, fallback, message) {
  const error = new Error(message);
  error.code = code(spec, name, fallback);
  return error;
}

// 压在账上的行内部记成 {id, kind, key, value, ts}，对外映射成四元组
function asRow(item) {
  if (Array.isArray(item)) {
    return { id: null, kind: item[0], key: item[1], value: item[2], ts: item[3] };
  }
  return { id: item && Object.prototype.hasOwnProperty.call(item, "id") ? item.id : null,
           kind: item.kind, key: item.key, value: item.value, ts: item.ts };
}

function toLedger(rows) {
  return rows.map(function (row) {
    return [row.kind, row.key, row.kind === "del" ? 0 : row.value, row.ts];
  });
}

// 不合法的事件一律报 E_BAD_EVENT（put 要有数值 value，del 不带 value）
function validateEvent(spec, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw failure(spec, "event_error_code", "E_BAD_EVENT", "事件必须是对象");
  }
  if (typeof event.key !== "string" || event.key.length === 0) {
    throw failure(spec, "event_error_code", "E_BAD_EVENT", "事件缺少 key");
  }
  if (typeof event.ts !== "number" || !Number.isFinite(event.ts)) {
    throw failure(spec, "event_error_code", "E_BAD_EVENT", "事件缺少时刻 ts");
  }
  if (event.kind === "put") {
    if (typeof event.value !== "number" || !Number.isFinite(event.value)) {
      throw failure(spec, "event_error_code", "E_BAD_EVENT", "put 缺少 value");
    }
    return;
  }
  if (event.kind === "del") {
    return;
  }
  throw failure(spec, "event_error_code", "E_BAD_EVENT", "未知的事件类型");
}

// 把一条操作落到状态上；时刻回落、删未知键都由当前状态推出
function applyOne(spec, state, row) {
  const stamp = lastStampOf(state.entries, state.tombstones, row.key);
  if (row.ts <= stamp) {
    throw failure(spec, "stale_error_code", "E_STALE_TS",
      "时刻 " + row.ts + " 不大于最后一次操作时刻 " + stamp);
  }
  if (row.kind === "put") {
    state.entries[row.key] = [row.value, row.ts];
    state.tombstones = removeTomb(state.tombstones, row.key);
  } else {
    if (!Object.prototype.hasOwnProperty.call(state.entries, row.key)) {
      throw failure(spec, "key_error_code", "E_NO_KEY", "未知键 " + row.key);
    }
    delete state.entries[row.key];
    state.tombstones = state.tombstones.concat([[row.key, row.ts]]);
  }
}

// 顺着队列应用：已处理过的跳过，预算用尽则原样压回账上
function runQueue(spec, state, queue, limit) {
  let applied = 0;
  let judged = 0;
  let remaining = limit === Infinity ? Infinity : limit;
  const ledger = [];
  for (let i = 0; i < queue.length; i += 1) {
    const item = queue[i];
    if (item.fromLedger) {
      // 账上的行此前已经做过合法性检查
      if (remaining === 0) {
        ledger.push(item.row);
        continue;
      }
      applyOne(spec, state, item.row);
      remaining -= 1;
      applied += 1;
      if (item.row.id !== null && state.applied.indexOf(item.row.id) === -1) {
        state.applied.push(item.row.id);
      }
      continue;
    }
    const event = item.row;
    validateEvent(spec, event);
    judged += 1;
    const row = { id: Object.prototype.hasOwnProperty.call(event, "id") ? event.id : null,
                  kind: event.kind, key: event.key,
                  value: event.kind === "del" ? 0 : event.value, ts: event.ts };
    if (row.id !== null && state.applied.indexOf(row.id) !== -1) {
      continue;
    }
    if (remaining === 0) {
      ledger.push(row);
      continue;
    }
    applyOne(spec, state, row);
    remaining -= 1;
    applied += 1;
    if (row.id !== null) {
      state.applied.push(row.id);
    }
  }
  state.ledger = ledger;
  return { applied: applied, judged: judged };
}

export function step(spec) {
  const source = spec.state || { entries: {}, tombstones: [], ledger: [], applied: [] };
  // 复制后再改，同一初始状态要能被首轮/二档/全量反复重跑
  const state = {
    entries: Object.assign({}, source.entries),
    tombstones: (source.tombstones || []).map(function (row) { return row.slice(); }),
    ledger: (source.ledger || []).map(asRow),
    applied: (source.applied || []).slice()
  };
  const events = spec.events || [];
  const queue = [];
  state.ledger.forEach(function (row) {
    queue.push({ fromLedger: true, row: row });
  });
  events.forEach(function (event) {
    queue.push({ fromLedger: false, row: event });
  });
  const limit = typeof spec.budget === "number" && Number.isFinite(spec.budget) && spec.budget >= 0
    ? spec.budget : Infinity;
  const stats = runQueue(spec, state, queue, limit);
  return { state: state, applied: stats.applied, ledger_before: state.ledger.length,
           ledger: toLedger(state.ledger), judged: stats.judged,
           judged_bound: events.length };
}

export function close(spec) {
  const source = spec.state || { entries: {}, tombstones: [], ledger: [], applied: [] };
  const state = {
    entries: Object.assign({}, source.entries),
    tombstones: (source.tombstones || []).map(function (row) { return row.slice(); }),
    ledger: (source.ledger || []).map(asRow),
    applied: (source.applied || []).slice()
  };
  const queue = state.ledger.map(function (row) {
    return { fromLedger: true, row: row };
  });
  const stats = runQueue(spec, state, queue, Infinity);
  return { state: state, catchup: stats.applied };
}
