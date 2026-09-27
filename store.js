// store.js：时刻查询与墓碑摘除
// 存活表 entries：key -> [value, ts]；墓碑序列 tombstones：[key, ts]
export function lastStampOf(entries, tombstones, key) {
  const alive = entries || {};
  if (Object.prototype.hasOwnProperty.call(alive, key)) {
    return alive[key][1];
  }
  const rows = tombstones || [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === key) {
      return rows[i][1];
    }
  }
  return 0;
}

export function removeTomb(rows, key) {
  return (rows || []).filter(function (row) {
    return row[0] !== key;
  });
}
