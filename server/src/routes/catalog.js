import { Router } from 'express';

import { pool } from '../db.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { allowRoles } from '../middleware/auth.js';

const router = Router();

// Get all active products
router.get(
    '/products',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT *
             FROM products
             WHERE active = true
             ORDER BY product_name`
        );

        res.json(rows);
    })
);

// Get inventory with available quantity
router.get(
    '/inventory',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT
                p.id AS product_id,
                p.product_code,
                p.product_name,
                p.unit,
                i.physical_qty,
                i.reserved_qty,
                (i.physical_qty - i.reserved_qty) AS available_qty
             FROM products p
             JOIN inventory i ON i.product_id = p.id
             ORDER BY p.product_name`
        );

        res.json(rows);
    })
);

// Update physical inventory (Admin only)
router.patch(
    '/inventory/:productId',
    allowRoles('ADMIN'),
    asyncHandler(async (req, res) => {
        const qty = Number(req.body.physicalQty);

        if (!Number.isInteger(qty) || qty < 0) {
            throw new AppError(
                400,
                'physicalQty must be a non-negative integer'
            );
        }

        const { rows } = await pool.query(
            `UPDATE inventory
             SET physical_qty = $1,
                 updated_at = NOW()
             WHERE product_id = $2
               AND $1 >= reserved_qty
             RETURNING *`,
            [qty, req.params.productId]
        );

        if (!rows[0]) {
            throw new AppError(
                400,
                'Product not found or physical quantity cannot be below reserved quantity'
            );
        }

        res.json(rows[0]);
    })
);

export default router;