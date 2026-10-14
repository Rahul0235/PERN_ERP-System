import 'dotenv/config';

import app from './app.js';
import { pool } from './db.js';

// Configure the server port
const port = Number(process.env.PORT || 8080);

// Warn if the JWT secret is missing
if (!process.env.JWT_SECRET) {
    console.warn(
        'WARNING: set JWT_SECRET in server/.env before using authentication.'
    );
}

// Start the Express server
const server = app.listen(port, () => {
    console.log(
        `PERN ERP API listening on http://localhost:${port}`
    );
});

// Gracefully shut down the server
const shutdown = async () => {
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
};

// Handle termination signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);