export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const asyncHandler = fn => (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next);
export function makeNumber(prefix) { return `${prefix}-${Date.now().toString().slice(-8)}-${Math.floor(Math.random()*900+100)}`; }
