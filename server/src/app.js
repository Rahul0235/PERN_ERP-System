import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import catalogRoutes from './routes/catalog.js';
import workflowRoutes from './routes/workflow.js';

import { authenticate } from './middleware/auth.js';
import { AppError } from './utils/errors.js';

const app = express();

// Security and request middleware
app.use(helmet());

app.use(
    cors({
        origin:
            process.env.CLIENT_ORIGIN ||
            'http://localhost:5173',
    })
);

app.use(express.json({ limit: '1mb' }));

// Authentication routes with rate limiting
app.use(
    '/api/auth',
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 30,
    }),
    authRoutes
);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Protected API routes
app.use(
    '/api',
    authenticate,
    catalogRoutes,
    workflowRoutes
);

// Handle unknown routes
app.use((req, res, next) => {
    next(new AppError(404, 'Route not found'));
});

// Global error handler
app.use((err, req, res, next) => {
    const status =
        err.status ||
        (err.code === '23505'
            ? 409
            : err.code === '23503' ||
                err.code === '23514'
              ? 400
              : 500);

    if (status === 500) {
        console.error(err);
    }

    res.status(status).json({
        error:
            status === 500
                ? 'Internal server error'
                : err.message || 'Request failed',
    });
});

export default app;