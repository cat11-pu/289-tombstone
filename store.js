// store.js：时刻查询与写删
export function lastStampOf(entries, tombstones, key) {
  if (Object.prototype.hasOwnProperty.call(entries, key)) {
    return entries[key][1];
  }
  for (const row of tombstones) {
    if (row[0] === key) {
      return row[1];
    }
  }
  return 0;
}

export function removeTomb(rows, key) {
  return rows.filter(function (row) { return row[0] !== key; });
}
