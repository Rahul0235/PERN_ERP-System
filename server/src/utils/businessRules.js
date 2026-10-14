import { AppError } from './errors.js';

// Validate whether a quotation can be converted into a Sales Order
export function assertCanConvertQuotation(
    status,
    existingOrder
) {
    if (status !== 'ACCEPTED') {
        throw new AppError(
            400,
            'Only ACCEPTED quotations can be converted'
        );
    }

    if (existingOrder) {
        throw new AppError(
            409,
            'This quotation already has a Sales Order'
        );
    }
}

// Validate inventory availability before reservation
export function assertAvailableStock(
    physicalQty,
    reservedQty,
    requestedQty
) {
    const available =
        Number(physicalQty) - Number(reservedQty);

    if (
        !Number.isInteger(Number(requestedQty)) ||
        Number(requestedQty) <= 0
    ) {
        throw new AppError(
            400,
            'Requested quantity must be a positive integer'
        );
    }

    if (available < Number(requestedQty)) {
        throw new AppError(
            409,
            'Insufficient available stock'
        );
    }

    return available;
}

// Validate user role permissions
export function assertRole(
    userRole,
    ...allowedRoles
) {
    if (!allowedRoles.includes(userRole)) {
        throw new AppError(
            403,
            'You do not have permission to perform this operation'
        );
    }

    return true;
}