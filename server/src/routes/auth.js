import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { pool } from '../db.js';
import { asyncHandler, AppError } from '../utils/errors.js';

const router = Router();

router.post(
    '/login',
    asyncHandler(async (req, res) => {
        const { email, password } = req.body || {};

        if (!email || !password) {
            throw new AppError(
                400,
                'Email and password are required'
            );
        }

        const { rows } = await pool.query(
            `SELECT id, name, email, password_hash, role
             FROM users
             WHERE lower(email) = lower($1)`,
            [email]
        );

        const user = rows[0];

        if (
            !user ||
            !(await bcrypt.compare(password, user.password_hash))
        ) {
            throw new AppError(401, 'Invalid email or password');
        }

        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not configured');
        }

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '8h',
            }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });
    })
);

export default router;