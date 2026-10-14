import pg from 'pg';
const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export async function transaction(fn) {
 const client = await pool.connect();
 try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
 catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
