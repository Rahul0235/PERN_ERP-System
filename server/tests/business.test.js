import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuotation } from '../src/utils/quotation.js';
import { assertCanConvertQuotation, assertAvailableStock, assertRole } from '../src/utils/businessRules.js';

test('quotation totals calculate base, discount, GST and grand total correctly',()=>{
 const q=calculateQuotation([{productId:1,quantity:10,unitPrice:100,discountPct:10,gstPct:18}]);
 assert.equal(q.lines[0].baseAmount,1000);assert.equal(q.lines[0].discountAmount,100);assert.equal(q.lines[0].gstAmount,162);assert.equal(q.grandTotal,1062);
});
test('DRAFT and REJECTED quotations cannot be converted',()=>{
 assert.throws(()=>assertCanConvertQuotation('DRAFT',null),/Only ACCEPTED/);
 assert.throws(()=>assertCanConvertQuotation('REJECTED',null),/Only ACCEPTED/);
});
test('the same quotation cannot create a second order',()=>{
 assert.throws(()=>assertCanConvertQuotation('ACCEPTED',{id:44}),/already has a Sales Order/);
 assert.doesNotThrow(()=>assertCanConvertQuotation('ACCEPTED',null));
});
test('reservation rejects quantities above available inventory',()=>{
 assert.equal(assertAvailableStock(100,30,70),70);
 assert.throws(()=>assertAvailableStock(100,30,71),/Insufficient available stock/);
});
test('restricted operation rejects non-admin roles',()=>{
 assert.throws(()=>assertRole('SALES_USER','ADMIN'),e=>e.status===403);
 assert.equal(assertRole('ADMIN','ADMIN'),true);
});
test('quotation calculator rejects invalid quantities and discount percentages',()=>{
 assert.throws(()=>calculateQuotation([{quantity:0,unitPrice:50}]),/Invalid quantity/);
 assert.throws(()=>calculateQuotation([{quantity:1,unitPrice:50,discountPct:101}]),/Invalid quantity/);
});
