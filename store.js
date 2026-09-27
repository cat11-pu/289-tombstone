// store.js：时刻查询与写删（基线：一律给零、原样返回）
export function lastStampOf(entries, tombstones, key) {
  return 0;
}

export function removeTomb(rows, key) {
  return rows;
}
