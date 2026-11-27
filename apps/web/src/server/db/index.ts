import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

declare global {
  // Reuse the pool across Next.js dev hot reloads.
  var __alpSql: ReturnType<typeof postgres> | undefined;
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (see .env.example)');
  return postgres(url, { max: 10, prepare: false });
}

const sql = globalThis.__alpSql ?? client();
if (process.env.NODE_ENV !== 'production') globalThis.__alpSql = sql;

export const db = drizzle(sql, { schema });
export { schema };
export type DB = typeof db;
