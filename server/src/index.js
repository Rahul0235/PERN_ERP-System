import 'dotenv/config';
import app from './app.js';
import { pool } from './db.js';
const port=Number(process.env.PORT||8080);
if(!process.env.JWT_SECRET) console.warn('WARNING: set JWT_SECRET in server/.env before using authentication.');
const server=app.listen(port,()=>console.log(`PERN ERP API listening on http://localhost:${port}`));
const shutdown=async()=>{server.close(async()=>{await pool.end();process.exit(0)});};
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
