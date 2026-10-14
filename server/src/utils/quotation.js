// Calculate quotation totals, discounts, and GST
export function calculateQuotation(items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error(
            'At least one quotation item is required'
        );
    }

    let subtotal = 0;
    let discountTotal = 0;
    let gstTotal = 0;

    const round = (number) =>
        Math.round((number + Number.EPSILON) * 100) / 100;

    const lines = items.map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const discountPct = Number(item.discountPct ?? 0);
        const gstPct = Number(item.gstPct ?? 18);

        if (
            !Number.isInteger(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(unitPrice) ||
            unitPrice < 0 ||
            !Number.isFinite(discountPct) ||
            discountPct < 0 ||
            discountPct > 100 ||
            !Number.isFinite(gstPct) ||
            gstPct < 0 ||
            gstPct > 100
        ) {
            throw new Error(
                'Invalid quantity, price, discount or GST'
            );
        }

        const baseAmount = round(quantity * unitPrice);

        const discountAmount = round(
            (baseAmount * discountPct) / 100
        );

        const taxableAmount = round(
            baseAmount - discountAmount
        );

        const gstAmount = round(
            (taxableAmount * gstPct) / 100
        );

        const lineAmount = round(
            taxableAmount + gstAmount
        );

        subtotal = round(subtotal + baseAmount);
        discountTotal = round(
            discountTotal + discountAmount
        );
        gstTotal = round(gstTotal + gstAmount);

        return {
            ...item,
            quantity,
            unitPrice,
            discountPct,
            gstPct,
            baseAmount,
            discountAmount,
            taxableAmount,
            gstAmount,
            lineAmount,
        };
    });

    const grandTotal = round(
        subtotal - discountTotal + gstTotal
    );

    return {
        lines,
        subtotal,
        discountTotal,
        gstTotal,
        grandTotal,
    };
}