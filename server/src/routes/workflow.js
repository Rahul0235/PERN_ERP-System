import { Router } from 'express';
import { pool, transaction } from '../db.js';
import { asyncHandler, AppError, makeNumber } from '../utils/errors.js';
import { calculateQuotation } from '../utils/quotation.js';
import { assertCanConvertQuotation, assertAvailableStock } from '../utils/businessRules.js';
import { allowRoles } from '../middleware/auth.js';
const router=Router();
const bad=(msg)=>{throw new AppError(400,msg)};

router.get('/customers',asyncHandler(async(req,res)=>{const {rows}=await pool.query('SELECT * FROM customers ORDER BY created_at DESC');res.json(rows)}));
router.post('/enquiries',allowRoles('SALES_USER','ADMIN'),asyncHandler(async(req,res)=>{
 const {customer,requiredDate,notes='',items}=req.body||{};
 if(!customer?.companyName||!customer?.contactPerson||!customer?.mobile||!customer?.email||!customer?.city) bad('Complete customer details are required');
 if(!Array.isArray(items)||!items.length||items.some(i=>!Number.isInteger(Number(i.quantity))||Number(i.quantity)<=0||!i.productId)) bad('Add products with positive integer quantities');
 const result=await transaction(async c=>{
  const cr=await c.query(`INSERT INTO customers(company_name,contact_person,mobile,email,city,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[customer.companyName,customer.contactPerson,customer.mobile,customer.email,customer.city,req.user.id]);
  const er=await c.query(`INSERT INTO enquiries(enquiry_number,customer_id,required_date,notes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[makeNumber('ENQ'),cr.rows[0].id,requiredDate||null,notes,req.user.id]);
  for(const item of items) await c.query('INSERT INTO enquiry_items(enquiry_id,product_id,quantity) VALUES($1,$2,$3)',[er.rows[0].id,item.productId,Number(item.quantity)]);
  return { ...er.rows[0], customer:cr.rows[0] };
 }); res.status(201).json(result);
}));
router.get('/enquiries',asyncHandler(async(req,res)=>{
 const {rows}=await pool.query(`SELECT e.*,c.company_name,c.contact_person,c.email customer_email,
 COALESCE(json_agg(json_build_object('productId',ei.product_id,'productName',p.product_name,'quantity',ei.quantity)) FILTER(WHERE ei.id IS NOT NULL),'[]') items
 FROM enquiries e JOIN customers c ON c.id=e.customer_id LEFT JOIN enquiry_items ei ON ei.enquiry_id=e.id LEFT JOIN products p ON p.id=ei.product_id GROUP BY e.id,c.id ORDER BY e.created_at DESC`);res.json(rows);
}));

router.post('/quotations',allowRoles('SALES_USER','ADMIN'),asyncHandler(async(req,res)=>{
 const {enquiryId,validUntil,items}=req.body||{};
 if(!enquiryId||!Array.isArray(items)||!items.length) bad('enquiryId and quotation items are required');
 const enquiry=(await pool.query('SELECT * FROM enquiries WHERE id=$1',[enquiryId])).rows[0]; if(!enquiry) throw new AppError(404,'Enquiry not found');
 const products=(await pool.query('SELECT id,base_price FROM products WHERE id=ANY($1::bigint[])',[items.map(i=>String(i.productId))])).rows;
 const normalized=items.map(i=>{const p=products.find(p=>String(p.id)===String(i.productId));if(!p) bad(`Invalid product ${i.productId}`);return {...i,unitPrice:i.unitPrice===undefined?p.base_price:Number(i.unitPrice)}});
 let calc;try{calc=calculateQuotation(normalized)}catch(e){bad(e.message)}
 const result=await transaction(async c=>{
  const q=(await c.query(`INSERT INTO quotations(quotation_number,enquiry_id,customer_id,valid_until,status,subtotal,discount_total,gst_total,grand_total,created_by)
  VALUES($1,$2,$3,$4,'DRAFT',$5,$6,$7,$8,$9) RETURNING *`,[makeNumber('QUO'),enquiry.id,enquiry.customer_id,validUntil||null,calc.subtotal,calc.discountTotal,calc.gstTotal,calc.grandTotal,req.user.id])).rows[0];
  for(const l of calc.lines) await c.query(`INSERT INTO quotation_items(quotation_id,product_id,quantity,unit_price,discount_pct,gst_pct,base_amount,discount_amount,taxable_amount,gst_amount,line_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[q.id,l.productId,l.quantity,l.unitPrice,l.discountPct,l.gstPct,l.baseAmount,l.discountAmount,l.taxableAmount,l.gstAmount,l.lineAmount]);
  await c.query(`UPDATE enquiries SET status='QUOTED' WHERE id=$1 AND status='NEW'`,[enquiry.id]);return q;
 });res.status(201).json({...result,items:calc.lines});
}));
router.get('/quotations',asyncHandler(async(req,res)=>{const {rows}=await pool.query(`SELECT q.*,c.company_name,e.enquiry_number,COALESCE(json_agg(json_build_object('productId',qi.product_id,'productName',p.product_name,'quantity',qi.quantity,'unitPrice',qi.unit_price,'discountPct',qi.discount_pct,'gstPct',qi.gst_pct,'lineAmount',qi.line_amount)) FILTER(WHERE qi.id IS NOT NULL),'[]') items FROM quotations q JOIN customers c ON c.id=q.customer_id JOIN enquiries e ON e.id=q.enquiry_id LEFT JOIN quotation_items qi ON qi.quotation_id=q.id LEFT JOIN products p ON p.id=qi.product_id GROUP BY q.id,c.id,e.id ORDER BY q.created_at DESC`);res.json(rows)}));
router.patch('/quotations/:id/status',allowRoles('SALES_USER','ADMIN'),asyncHandler(async(req,res)=>{
 const {status}=req.body||{};if(!['SENT','ACCEPTED','REJECTED'].includes(status)) bad('Status must be SENT, ACCEPTED or REJECTED');
 const r=await transaction(async c=>{
  const q=(await c.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!q) throw new AppError(404,'Quotation not found');
  const transitions={DRAFT:['SENT','REJECTED'],SENT:['ACCEPTED','REJECTED'],ACCEPTED:[],REJECTED:[]};if(!transitions[q.status]?.includes(status)) bad(`Cannot change quotation from ${q.status} to ${status}`);
  const updated=(await c.query('UPDATE quotations SET status=$1 WHERE id=$2 RETURNING *',[status,q.id])).rows[0];
  if(status==='ACCEPTED') await c.query(`UPDATE enquiries SET status='WON' WHERE id=$1`,[q.enquiry_id]);if(status==='REJECTED') await c.query(`UPDATE enquiries SET status='LOST' WHERE id=$1`,[q.enquiry_id]);return updated;
 });res.json(r);
}));
router.post('/quotations/:id/convert',allowRoles('SALES_USER','ADMIN'),asyncHandler(async(req,res)=>{
 const order=await transaction(async c=>{
  const q=(await c.query('SELECT * FROM quotations WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!q) throw new AppError(404,'Quotation not found');const existing=(await c.query('SELECT id FROM sales_orders WHERE quotation_id=$1',[q.id])).rows[0];assertCanConvertQuotation(q.status,existing);
  const o=(await c.query(`INSERT INTO sales_orders(order_number,quotation_id,customer_id,total_amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[makeNumber('SO'),q.id,q.customer_id,q.grand_total,req.user.id])).rows[0];
  await c.query(`INSERT INTO sales_order_items(sales_order_id,product_id,quantity,unit_price,line_amount) SELECT $1,product_id,quantity,unit_price,line_amount FROM quotation_items WHERE quotation_id=$2`,[o.id,q.id]);return o;
 });res.status(201).json(order);
}));
router.get('/sales-orders',asyncHandler(async(req,res)=>{const {rows}=await pool.query(`SELECT so.*,c.company_name,q.quotation_number,COALESCE(json_agg(json_build_object('productId',si.product_id,'productName',p.product_name,'quantity',si.quantity,'dispatchedQty',si.dispatched_qty,'unitPrice',si.unit_price,'lineAmount',si.line_amount,'physicalQty',i.physical_qty,'reservedQty',i.reserved_qty,'availableQty',i.physical_qty-i.reserved_qty)) FILTER(WHERE si.id IS NOT NULL),'[]') items FROM sales_orders so JOIN customers c ON c.id=so.customer_id JOIN quotations q ON q.id=so.quotation_id LEFT JOIN sales_order_items si ON si.sales_order_id=so.id LEFT JOIN products p ON p.id=si.product_id LEFT JOIN inventory i ON i.product_id=si.product_id GROUP BY so.id,c.id,q.id ORDER BY so.created_at DESC`);res.json(rows)}));
router.post('/sales-orders/:id/confirm',allowRoles('ADMIN'),asyncHandler(async(req,res)=>{
 const order=await transaction(async c=>{
  const o=(await c.query('SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!o) throw new AppError(404,'Sales Order not found');if(o.status!=='PENDING') bad(`Only PENDING orders can be confirmed (current: ${o.status})`);
  const items=(await c.query('SELECT * FROM sales_order_items WHERE sales_order_id=$1 ORDER BY product_id',[o.id])).rows;
  for(const item of items){const inv=(await c.query('SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE',[item.product_id])).rows[0];if(!inv) bad(`Inventory missing for product ${item.product_id}`);try { assertAvailableStock(inv.physical_qty,inv.reserved_qty,item.quantity); } catch(e) { if(e.status===409) throw new AppError(409,`Insufficient available stock for product ${item.product_id}`); throw e; }}
  for(const item of items) await c.query('UPDATE inventory SET reserved_qty=reserved_qty+$1,updated_at=NOW() WHERE product_id=$2',[item.quantity,item.product_id]);
  return (await c.query(`UPDATE sales_orders SET status='CONFIRMED',confirmed_at=NOW() WHERE id=$1 RETURNING *`,[o.id])).rows[0];
 });res.json(order);
}));
router.post('/sales-orders/:id/dispatch',allowRoles('ADMIN'),asyncHandler(async(req,res)=>{
 const {vehicleNumber,driverName}=req.body||{};if(!vehicleNumber?.trim()||!driverName?.trim()) bad('Vehicle number and driver name are required');
 const result=await transaction(async c=>{
  const o=(await c.query('SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!o) throw new AppError(404,'Sales Order not found');if(o.status!=='CONFIRMED') bad('Only CONFIRMED orders can be dispatched');
  const items=(await c.query('SELECT * FROM sales_order_items WHERE sales_order_id=$1 ORDER BY product_id',[o.id])).rows;
  for(const item of items){const inv=(await c.query('SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE',[item.product_id])).rows[0];const remaining=Number(item.quantity)-Number(item.dispatched_qty);if(remaining<=0) bad('Order items have already been dispatched');if(Number(inv.reserved_qty)<remaining||Number(inv.physical_qty)<remaining) throw new AppError(409,'Inventory reservation is inconsistent; dispatch stopped');}
  const d=(await c.query(`INSERT INTO dispatches(dispatch_number,sales_order_id,vehicle_number,driver_name,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,[makeNumber('DSP'),o.id,vehicleNumber.trim(),driverName.trim(),req.user.id])).rows[0];
  for(const item of items){const qty=Number(item.quantity)-Number(item.dispatched_qty);await c.query('UPDATE inventory SET physical_qty=physical_qty-$1,reserved_qty=reserved_qty-$1,updated_at=NOW() WHERE product_id=$2',[qty,item.product_id]);await c.query('UPDATE sales_order_items SET dispatched_qty=dispatched_qty+$1 WHERE id=$2',[qty,item.id]);await c.query('INSERT INTO dispatch_items(dispatch_id,product_id,quantity) VALUES($1,$2,$3)',[d.id,item.product_id,qty]);}
  await c.query(`UPDATE sales_orders SET status='DISPATCHED' WHERE id=$1`,[o.id]);return d;
 });res.status(201).json(result);
}));
router.post('/sales-orders/:id/cancel',allowRoles('ADMIN'),asyncHandler(async(req,res)=>{
 const result=await transaction(async c=>{
  const o=(await c.query('SELECT * FROM sales_orders WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!o) throw new AppError(404,'Sales Order not found');if(!['PENDING','CONFIRMED'].includes(o.status)) bad(`Cannot cancel an order in ${o.status} status`);
  if(o.status==='CONFIRMED'){const items=(await c.query('SELECT * FROM sales_order_items WHERE sales_order_id=$1',[o.id])).rows;for(const item of items){const inv=(await c.query('SELECT * FROM inventory WHERE product_id=$1 FOR UPDATE',[item.product_id])).rows[0];const unshipped=Number(item.quantity)-Number(item.dispatched_qty);if(Number(inv.reserved_qty)<unshipped) throw new AppError(409,'Inventory reservation is inconsistent');await c.query('UPDATE inventory SET reserved_qty=reserved_qty-$1,updated_at=NOW() WHERE product_id=$2',[unshipped,item.product_id]);}}
  return (await c.query(`UPDATE sales_orders SET status='CANCELLED' WHERE id=$1 RETURNING *`,[o.id])).rows[0];
 });res.json(result);
}));
router.get('/dispatches',allowRoles('ADMIN'),asyncHandler(async(req,res)=>{const {rows}=await pool.query('SELECT d.*,so.order_number FROM dispatches d JOIN sales_orders so ON so.id=d.sales_order_id ORDER BY d.dispatch_date DESC');res.json(rows)}));
export default router;
