// Custom application error class
export class AppError extends Error {
    constructor(status, message) {
        super(message);

        this.status = status;
    }
}

// Handle errors in asynchronous Express routes
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Generate unique business document numbers
export function makeNumber(prefix) {
    return `${prefix}-${Date.now()
        .toString()
        .slice(-8)}-${Math.floor(Math.random() * 900 + 100)}`;
}