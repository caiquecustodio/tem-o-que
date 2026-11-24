import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const source = process.argv[2] ?? 'data/mercearia.db';
const output = process.argv[3] ?? 'data/d1-import.sql';
const db = new DatabaseSync(source, { readOnly: true });
const order = ['products','employees','store_settings','sales','sale_items','payments','stock_movements','price_history','period_closures'];
const quote = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
};

try {
  const sql = ['-- Export generated from the recovered local SQLite database.'];
  const counts = {};
  for (const table of order) {
    const rows = db.prepare(`SELECT * FROM "${table}"`).all();
    counts[table] = rows.length;
    for (const row of rows) {
      const columns = Object.keys(row);
      sql.push(`INSERT OR REPLACE INTO "${table}" (${columns.map((name) => `"${name}"`).join(',')}) VALUES (${columns.map((name) => quote(row[name])).join(',')});`);
    }
  }
  fs.writeFileSync(output, `${sql.join('\n')}\n`, { encoding: 'utf8', flag: 'w' });
  console.log(JSON.stringify({ output, counts }, null, 2));
} finally {
  db.close();
}
