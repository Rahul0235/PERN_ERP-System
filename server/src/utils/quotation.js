export function calculateQuotation(items) {
 if (!Array.isArray(items) || items.length === 0) throw new Error('At least one quotation item is required');
 let subtotal=0, discountTotal=0, gstTotal=0;
 const lines = items.map((item) => {
  const quantity=Number(item.quantity), unitPrice=Number(item.unitPrice), discountPct=Number(item.discountPct ?? 0), gstPct=Number(item.gstPct ?? 18);
  if (!Number.isInteger(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discountPct) || discountPct<0 || discountPct>100 || !Number.isFinite(gstPct) || gstPct<0 || gstPct>100) throw new Error('Invalid quantity, price, discount or GST');
  const round=n=>Math.round((n+Number.EPSILON)*100)/100;
  const baseAmount=round(quantity*unitPrice), discountAmount=round(baseAmount*discountPct/100), taxableAmount=round(baseAmount-discountAmount), gstAmount=round(taxableAmount*gstPct/100), lineAmount=round(taxableAmount+gstAmount);
  subtotal=round(subtotal+baseAmount); discountTotal=round(discountTotal+discountAmount); gstTotal=round(gstTotal+gstAmount);
  return { ...item, quantity, unitPrice, discountPct, gstPct, baseAmount, discountAmount, taxableAmount, gstAmount, lineAmount };
 });
 return { lines, subtotal, discountTotal, gstTotal, grandTotal: Math.round((subtotal-discountTotal+gstTotal+Number.EPSILON)*100)/100 };
}
