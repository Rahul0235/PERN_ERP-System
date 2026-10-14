import { Router } from 'express';

import { pool, transaction } from '../db.js';
import {
    asyncHandler,
    AppError,
    makeNumber,
} from '../utils/errors.js';

import { calculateQuotation } from '../utils/quotation.js';

import {
    assertCanConvertQuotation,
    assertAvailableStock,
} from '../utils/businessRules.js';

import { allowRoles } from '../middleware/auth.js';

const router = Router();

// Helper for throwing a 400 Bad Request error
const bad = (message) => {
    throw new AppError(400, message);
};

// ==================================================
// CUSTOMERS
// ==================================================

// Get all customers
router.get(
    '/customers',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT *
             FROM customers
             ORDER BY created_at DESC`
        );

        res.json(rows);
    })
);

// ==================================================
// ENQUIRIES
// ==================================================

// Create a customer enquiry
router.post(
    '/enquiries',
    allowRoles('SALES_USER', 'ADMIN'),
    asyncHandler(async (req, res) => {
        const {
            customer,
            requiredDate,
            notes = '',
            items,
        } = req.body || {};

        // Validate customer details
        if (
            !customer?.companyName ||
            !customer?.contactPerson ||
            !customer?.mobile ||
            !customer?.email ||
            !customer?.city
        ) {
            bad('Complete customer details are required');
        }

        // Validate enquiry items
        if (
            !Array.isArray(items) ||
            !items.length ||
            items.some(
                (item) =>
                    !Number.isInteger(Number(item.quantity)) ||
                    Number(item.quantity) <= 0 ||
                    !item.productId
            )
        ) {
            bad(
                'Add products with positive integer quantities'
            );
        }

        // Create customer and enquiry in one transaction
        const result = await transaction(async (client) => {
            const customerResult = await client.query(
                `INSERT INTO customers (
                    company_name,
                    contact_person,
                    mobile,
                    email,
                    city,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    customer.companyName,
                    customer.contactPerson,
                    customer.mobile,
                    customer.email,
                    customer.city,
                    req.user.id,
                ]
            );

            const createdCustomer = customerResult.rows[0];

            const enquiryResult = await client.query(
                `INSERT INTO enquiries (
                    enquiry_number,
                    customer_id,
                    required_date,
                    notes,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [
                    makeNumber('ENQ'),
                    createdCustomer.id,
                    requiredDate || null,
                    notes,
                    req.user.id,
                ]
            );

            const enquiry = enquiryResult.rows[0];

            // Add products to the enquiry
            for (const item of items) {
                await client.query(
                    `INSERT INTO enquiry_items (
                        enquiry_id,
                        product_id,
                        quantity
                    )
                    VALUES ($1, $2, $3)`,
                    [
                        enquiry.id,
                        item.productId,
                        Number(item.quantity),
                    ]
                );
            }

            return {
                ...enquiry,
                customer: createdCustomer,
            };
        });

        res.status(201).json(result);
    })
);

// Get all enquiries with their products
router.get(
    '/enquiries',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT
                e.*,
                c.company_name,
                c.contact_person,
                c.email AS customer_email,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'productId', ei.product_id,
                            'productName', p.product_name,
                            'quantity', ei.quantity
                        )
                    ) FILTER (WHERE ei.id IS NOT NULL),
                    '[]'
                ) AS items
             FROM enquiries e
             JOIN customers c
                ON c.id = e.customer_id
             LEFT JOIN enquiry_items ei
                ON ei.enquiry_id = e.id
             LEFT JOIN products p
                ON p.id = ei.product_id
             GROUP BY e.id, c.id
             ORDER BY e.created_at DESC`
        );

        res.json(rows);
    })
);

// ==================================================
// QUOTATIONS
// ==================================================

// Create a quotation for an enquiry
router.post(
    '/quotations',
    allowRoles('SALES_USER', 'ADMIN'),
    asyncHandler(async (req, res) => {
        const {
            enquiryId,
            validUntil,
            items,
        } = req.body || {};

        if (
            !enquiryId ||
            !Array.isArray(items) ||
            !items.length
        ) {
            bad(
                'enquiryId and quotation items are required'
            );
        }

        // Find the enquiry
        const enquiryResult = await pool.query(
            'SELECT * FROM enquiries WHERE id = $1',
            [enquiryId]
        );

        const enquiry = enquiryResult.rows[0];

        if (!enquiry) {
            throw new AppError(404, 'Enquiry not found');
        }

        // Retrieve product base prices
        const productResult = await pool.query(
            `SELECT id, base_price
             FROM products
             WHERE id = ANY($1::bigint[])`,
            [items.map((item) => String(item.productId))]
        );

        const products = productResult.rows;

        // Normalize quotation items using backend prices
        const normalizedItems = items.map((item) => {
            const product = products.find(
                (product) =>
                    String(product.id) ===
                    String(item.productId)
            );

            if (!product) {
                bad(`Invalid product ${item.productId}`);
            }

            return {
                ...item,
                unitPrice:
                    item.unitPrice === undefined
                        ? product.base_price
                        : Number(item.unitPrice),
            };
        });

        // Calculate quotation totals
        let calculation;

        try {
            calculation = calculateQuotation(normalizedItems);
        } catch (error) {
            bad(error.message);
        }

        // Save quotation and its items
        const result = await transaction(async (client) => {
            const quotationResult = await client.query(
                `INSERT INTO quotations (
                    quotation_number,
                    enquiry_id,
                    customer_id,
                    valid_until,
                    status,
                    subtotal,
                    discount_total,
                    gst_total,
                    grand_total,
                    created_by
                )
                VALUES (
                    $1, $2, $3, $4, 'DRAFT',
                    $5, $6, $7, $8, $9
                )
                RETURNING *`,
                [
                    makeNumber('QUO'),
                    enquiry.id,
                    enquiry.customer_id,
                    validUntil || null,
                    calculation.subtotal,
                    calculation.discountTotal,
                    calculation.gstTotal,
                    calculation.grandTotal,
                    req.user.id,
                ]
            );

            const quotation = quotationResult.rows[0];

            for (const line of calculation.lines) {
                await client.query(
                    `INSERT INTO quotation_items (
                        quotation_id,
                        product_id,
                        quantity,
                        unit_price,
                        discount_pct,
                        gst_pct,
                        base_amount,
                        discount_amount,
                        taxable_amount,
                        gst_amount,
                        line_amount
                    )
                    VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10, $11
                    )`,
                    [
                        quotation.id,
                        line.productId,
                        line.quantity,
                        line.unitPrice,
                        line.discountPct,
                        line.gstPct,
                        line.baseAmount,
                        line.discountAmount,
                        line.taxableAmount,
                        line.gstAmount,
                        line.lineAmount,
                    ]
                );
            }

            // Update enquiry status when appropriate
            await client.query(
                `UPDATE enquiries
                 SET status = 'QUOTED'
                 WHERE id = $1
                   AND status = 'NEW'`,
                [enquiry.id]
            );

            return quotation;
        });

        res.status(201).json({
            ...result,
            items: calculation.lines,
        });
    })
);

// Get all quotations with their items
router.get(
    '/quotations',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT
                q.*,
                c.company_name,
                e.enquiry_number,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'productId', qi.product_id,
                            'productName', p.product_name,
                            'quantity', qi.quantity,
                            'unitPrice', qi.unit_price,
                            'discountPct', qi.discount_pct,
                            'gstPct', qi.gst_pct,
                            'lineAmount', qi.line_amount
                        )
                    ) FILTER (WHERE qi.id IS NOT NULL),
                    '[]'
                ) AS items
             FROM quotations q
             JOIN customers c
                ON c.id = q.customer_id
             JOIN enquiries e
                ON e.id = q.enquiry_id
             LEFT JOIN quotation_items qi
                ON qi.quotation_id = q.id
             LEFT JOIN products p
                ON p.id = qi.product_id
             GROUP BY q.id, c.id, e.id
             ORDER BY q.created_at DESC`
        );

        res.json(rows);
    })
);

// Update quotation status
router.patch(
    '/quotations/:id/status',
    allowRoles('SALES_USER', 'ADMIN'),
    asyncHandler(async (req, res) => {
        const { status } = req.body || {};

        const allowedStatuses = [
            'SENT',
            'ACCEPTED',
            'REJECTED',
        ];

        if (!allowedStatuses.includes(status)) {
            bad(
                'Status must be SENT, ACCEPTED or REJECTED'
            );
        }

        const result = await transaction(async (client) => {
            const quotationResult = await client.query(
                'SELECT * FROM quotations WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            const quotation = quotationResult.rows[0];

            if (!quotation) {
                throw new AppError(
                    404,
                    'Quotation not found'
                );
            }

            const transitions = {
                DRAFT: ['SENT', 'REJECTED'],
                SENT: ['ACCEPTED', 'REJECTED'],
                ACCEPTED: [],
                REJECTED: [],
            };

            if (
                !transitions[quotation.status]?.includes(status)
            ) {
                bad(
                    `Cannot change quotation from ${quotation.status} to ${status}`
                );
            }

            const updatedResult = await client.query(
                `UPDATE quotations
                 SET status = $1
                 WHERE id = $2
                 RETURNING *`,
                [status, quotation.id]
            );

            const updatedQuotation = updatedResult.rows[0];

            if (status === 'ACCEPTED') {
                await client.query(
                    `UPDATE enquiries
                     SET status = 'WON'
                     WHERE id = $1`,
                    [quotation.enquiry_id]
                );
            }

            if (status === 'REJECTED') {
                await client.query(
                    `UPDATE enquiries
                     SET status = 'LOST'
                     WHERE id = $1`,
                    [quotation.enquiry_id]
                );
            }

            return updatedQuotation;
        });

        res.json(result);
    })
);

// Convert an accepted quotation into a Sales Order
router.post(
    '/quotations/:id/convert',
    allowRoles('SALES_USER', 'ADMIN'),
    asyncHandler(async (req, res) => {
        const order = await transaction(async (client) => {
            const quotationResult = await client.query(
                'SELECT * FROM quotations WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            const quotation = quotationResult.rows[0];

            if (!quotation) {
                throw new AppError(
                    404,
                    'Quotation not found'
                );
            }

            const existingOrderResult = await client.query(
                `SELECT id
                 FROM sales_orders
                 WHERE quotation_id = $1`,
                [quotation.id]
            );

            const existingOrder = existingOrderResult.rows[0];

            assertCanConvertQuotation(
                quotation.status,
                existingOrder
            );

            const orderResult = await client.query(
                `INSERT INTO sales_orders (
                    order_number,
                    quotation_id,
                    customer_id,
                    total_amount,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [
                    makeNumber('SO'),
                    quotation.id,
                    quotation.customer_id,
                    quotation.grand_total,
                    req.user.id,
                ]
            );

            const salesOrder = orderResult.rows[0];

            await client.query(
                `INSERT INTO sales_order_items (
                    sales_order_id,
                    product_id,
                    quantity,
                    unit_price,
                    line_amount
                )
                SELECT
                    $1,
                    product_id,
                    quantity,
                    unit_price,
                    line_amount
                FROM quotation_items
                WHERE quotation_id = $2`,
                [salesOrder.id, quotation.id]
            );

            return salesOrder;
        });

        res.status(201).json(order);
    })
);

// ==================================================
// SALES ORDERS
// ==================================================

// Get all Sales Orders with product and inventory details
router.get(
    '/sales-orders',
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT
                so.*,
                c.company_name,
                q.quotation_number,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'productId', si.product_id,
                            'productName', p.product_name,
                            'quantity', si.quantity,
                            'dispatchedQty', si.dispatched_qty,
                            'unitPrice', si.unit_price,
                            'lineAmount', si.line_amount,
                            'physicalQty', i.physical_qty,
                            'reservedQty', i.reserved_qty,
                            'availableQty',
                                i.physical_qty - i.reserved_qty
                        )
                    ) FILTER (WHERE si.id IS NOT NULL),
                    '[]'
                ) AS items
             FROM sales_orders so
             JOIN customers c
                ON c.id = so.customer_id
             JOIN quotations q
                ON q.id = so.quotation_id
             LEFT JOIN sales_order_items si
                ON si.sales_order_id = so.id
             LEFT JOIN products p
                ON p.id = si.product_id
             LEFT JOIN inventory i
                ON i.product_id = si.product_id
             GROUP BY so.id, c.id, q.id
             ORDER BY so.created_at DESC`
        );

        res.json(rows);
    })
);

// Confirm a Sales Order and reserve inventory (Admin only)
router.post(
    '/sales-orders/:id/confirm',
    allowRoles('ADMIN'),
    asyncHandler(async (req, res) => {
        const order = await transaction(async (client) => {
            const orderResult = await client.query(
                'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            const salesOrder = orderResult.rows[0];

            if (!salesOrder) {
                throw new AppError(
                    404,
                    'Sales Order not found'
                );
            }

            if (salesOrder.status !== 'PENDING') {
                bad(
                    `Only PENDING orders can be confirmed (current: ${salesOrder.status})`
                );
            }

            const itemsResult = await client.query(
                `SELECT *
                 FROM sales_order_items
                 WHERE sales_order_id = $1
                 ORDER BY product_id`,
                [salesOrder.id]
            );

            const items = itemsResult.rows;

            // Lock inventory rows and verify stock availability
            for (const item of items) {
                const inventoryResult = await client.query(
                    `SELECT *
                     FROM inventory
                     WHERE product_id = $1
                     FOR UPDATE`,
                    [item.product_id]
                );

                const inventory = inventoryResult.rows[0];

                if (!inventory) {
                    bad(
                        `Inventory missing for product ${item.product_id}`
                    );
                }

                try {
                    assertAvailableStock(
                        inventory.physical_qty,
                        inventory.reserved_qty,
                        item.quantity
                    );
                } catch (error) {
                    if (error.status === 409) {
                        throw new AppError(
                            409,
                            `Insufficient available stock for product ${item.product_id}`
                        );
                    }

                    throw error;
                }
            }

            // Reserve stock after all items pass validation
            for (const item of items) {
                await client.query(
                    `UPDATE inventory
                     SET reserved_qty = reserved_qty + $1,
                         updated_at = NOW()
                     WHERE product_id = $2`,
                    [item.quantity, item.product_id]
                );
            }

            const updatedOrderResult = await client.query(
                `UPDATE sales_orders
                 SET status = 'CONFIRMED',
                     confirmed_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [salesOrder.id]
            );

            return updatedOrderResult.rows[0];
        });

        res.json(order);
    })
);

// ==================================================
// DISPATCH
// ==================================================

// Dispatch a confirmed Sales Order (Admin only)
router.post(
    '/sales-orders/:id/dispatch',
    allowRoles('ADMIN'),
    asyncHandler(async (req, res) => {
        const {
            vehicleNumber,
            driverName,
        } = req.body || {};

        if (
            !vehicleNumber?.trim() ||
            !driverName?.trim()
        ) {
            bad(
                'Vehicle number and driver name are required'
            );
        }

        const result = await transaction(async (client) => {
            const orderResult = await client.query(
                'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            const salesOrder = orderResult.rows[0];

            if (!salesOrder) {
                throw new AppError(
                    404,
                    'Sales Order not found'
                );
            }

            if (salesOrder.status !== 'CONFIRMED') {
                bad(
                    'Only CONFIRMED orders can be dispatched'
                );
            }

            const itemsResult = await client.query(
                `SELECT *
                 FROM sales_order_items
                 WHERE sales_order_id = $1
                 ORDER BY product_id`,
                [salesOrder.id]
            );

            const items = itemsResult.rows;

            // Validate inventory before dispatching
            for (const item of items) {
                const inventoryResult = await client.query(
                    `SELECT *
                     FROM inventory
                     WHERE product_id = $1
                     FOR UPDATE`,
                    [item.product_id]
                );

                const inventory = inventoryResult.rows[0];

                const remainingQuantity =
                    Number(item.quantity) -
                    Number(item.dispatched_qty);

                if (remainingQuantity <= 0) {
                    bad(
                        'Order items have already been dispatched'
                    );
                }

                if (
                    Number(inventory.reserved_qty) <
                        remainingQuantity ||
                    Number(inventory.physical_qty) <
                        remainingQuantity
                ) {
                    throw new AppError(
                        409,
                        'Inventory reservation is inconsistent; dispatch stopped'
                    );
                }
            }

            // Create dispatch record
            const dispatchResult = await client.query(
                `INSERT INTO dispatches (
                    dispatch_number,
                    sales_order_id,
                    vehicle_number,
                    driver_name,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`,
                [
                    makeNumber('DSP'),
                    salesOrder.id,
                    vehicleNumber.trim(),
                    driverName.trim(),
                    req.user.id,
                ]
            );

            const dispatch = dispatchResult.rows[0];

            // Reduce physical and reserved inventory
            for (const item of items) {
                const quantity =
                    Number(item.quantity) -
                    Number(item.dispatched_qty);

                await client.query(
                    `UPDATE inventory
                     SET physical_qty = physical_qty - $1,
                         reserved_qty = reserved_qty - $1,
                         updated_at = NOW()
                     WHERE product_id = $2`,
                    [quantity, item.product_id]
                );

                await client.query(
                    `UPDATE sales_order_items
                     SET dispatched_qty = dispatched_qty + $1
                     WHERE id = $2`,
                    [quantity, item.id]
                );

                await client.query(
                    `INSERT INTO dispatch_items (
                        dispatch_id,
                        product_id,
                        quantity
                    )
                    VALUES ($1, $2, $3)`,
                    [
                        dispatch.id,
                        item.product_id,
                        quantity,
                    ]
                );
            }

            await client.query(
                `UPDATE sales_orders
                 SET status = 'DISPATCHED'
                 WHERE id = $1`,
                [salesOrder.id]
            );

            return dispatch;
        });

        res.status(201).json(result);
    })
);

// Cancel a Sales Order and release unshipped reserved inventory
router.post(
    '/sales-orders/:id/cancel',
    allowRoles('ADMIN'),
    asyncHandler(async (req, res) => {
        const result = await transaction(async (client) => {
            const orderResult = await client.query(
                'SELECT * FROM sales_orders WHERE id = $1 FOR UPDATE',
                [req.params.id]
            );

            const salesOrder = orderResult.rows[0];

            if (!salesOrder) {
                throw new AppError(
                    404,
                    'Sales Order not found'
                );
            }

            if (
                !['PENDING', 'CONFIRMED'].includes(
                    salesOrder.status
                )
            ) {
                bad(
                    `Cannot cancel an order in ${salesOrder.status} status`
                );
            }

            // Release any unshipped reserved inventory
            if (salesOrder.status === 'CONFIRMED') {
                const itemsResult = await client.query(
                    `SELECT *
                     FROM sales_order_items
                     WHERE sales_order_id = $1`,
                    [salesOrder.id]
                );

                for (const item of itemsResult.rows) {
                    const inventoryResult = await client.query(
                        `SELECT *
                         FROM inventory
                         WHERE product_id = $1
                         FOR UPDATE`,
                        [item.product_id]
                    );

                    const inventory = inventoryResult.rows[0];

                    const unshippedQuantity =
                        Number(item.quantity) -
                        Number(item.dispatched_qty);

                    if (
                        Number(inventory.reserved_qty) <
                        unshippedQuantity
                    ) {
                        throw new AppError(
                            409,
                            'Inventory reservation is inconsistent'
                        );
                    }

                    await client.query(
                        `UPDATE inventory
                         SET reserved_qty = reserved_qty - $1,
                             updated_at = NOW()
                         WHERE product_id = $2`,
                        [
                            unshippedQuantity,
                            item.product_id,
                        ]
                    );
                }
            }

            const updatedOrderResult = await client.query(
                `UPDATE sales_orders
                 SET status = 'CANCELLED'
                 WHERE id = $1
                 RETURNING *`,
                [salesOrder.id]
            );

            return updatedOrderResult.rows[0];
        });

        res.json(result);
    })
);

// Get all dispatches (Admin only)
router.get(
    '/dispatches',
    allowRoles('ADMIN'),
    asyncHandler(async (req, res) => {
        const { rows } = await pool.query(
            `SELECT
                d.*,
                so.order_number
             FROM dispatches d
             JOIN sales_orders so
                ON so.id = d.sales_order_id
             ORDER BY d.dispatch_date DESC`
        );

        res.json(rows);
    })
);

export default router;