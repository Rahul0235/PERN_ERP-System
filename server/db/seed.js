import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const products = [
    ['IND-001', 'Industrial Product A', 'Fasteners', 'pcs', 125], ['IND-002', 'Industrial Product B', 'Bearings', 'pcs', 450],
    ['IND-003', 'Industrial Product C', 'Pumps', 'unit', 7200], ['IND-004', 'Industrial Product D', 'Safety', 'pcs', 850],
    ['IND-005', 'Industrial Product E', 'Electrical', 'unit', 2350], ['IND-006', 'Industrial Product F', 'Tools', 'pcs', 620]
];
try {
    const adminHash = await bcrypt.hash('Admin@123', 12), salesHash = await bcrypt.hash('Sales@123', 12);
    await pool.query(`INSERT INTO users(name,email,password_hash,role) VALUES
 ('ERP Admin','admin@example.com',$1,'ADMIN'),('Sales User','sales@example.com',$2,'SALES_USER')
 ON CONFLICT(email) DO NOTHING`, [adminHash, salesHash]);
    for (const p of products) {
        const r = await pool.query('INSERT INTO products(product_code,product_name,category,unit,base_price) VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_code) DO UPDATE SET product_name=EXCLUDED.product_name RETURNING id', p);
        await pool.query('INSERT INTO inventory(product_id,physical_qty,reserved_qty) VALUES($1,200,0) ON CONFLICT(product_id) DO NOTHING', [r.rows[0].id]);
    }
    console.log('Seed complete. Login: admin@example.com / Admin@123 and sales@example.com / Sales@123');
} catch (e) { console.error(e); process.exitCode = 1; } finally { await pool.end(); }
