import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors.js';
import { assertRole } from '../utils/businessRules.js';

export function authenticate(req, res, next) {
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    
    if (!token) return next(new AppError(401, 'Authentication required'));
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET); next(); 
    }
    catch { 
        next(new AppError(401, 'Invalid or expired token')); 
    }
}
export const allowRoles = (...roles) => (req, res, next) => 
    { 
        try { 
            assertRole(req.user?.role, ...roles); next();
        } 
        catch (e) {
            next(e);
        } 
    };
