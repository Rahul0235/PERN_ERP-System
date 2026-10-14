import pg from 'pg';

const { Pool } = pg;

// Create a PostgreSQL connection pool
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

// Execute database operations in a transaction
export async function transaction(fn) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const result = await fn(client);

        await client.query('COMMIT');

        return result;
    } catch (error) {
        await client.query('ROLLBACK');

        throw error;
    } finally {
        client.release();
    }
}