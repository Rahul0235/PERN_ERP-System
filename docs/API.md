# REST API reference
Base URL: `http://localhost:8080/api`

Except `POST /auth/login` and `GET /health`, endpoints require `Authorization: Bearer <JWT>`. Errors return `{ "error": "message" }`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/health` | Public | Health check |
| POST | `/auth/login` | Public | Get JWT and user |
| GET | `/products` | Authenticated | Active product master |
| GET | `/inventory` | Authenticated | Physical, reserved and available stock |
| PATCH | `/inventory/:productId` | Admin | Set physical quantity with validation |
| GET | `/customers` | Authenticated | List customers |
| POST | `/enquiries` | Sales/Admin | Create customer, enquiry and enquiry items |
| GET | `/enquiries` | Authenticated | List enquiries with product lines |
| POST | `/quotations` | Sales/Admin | Create draft quotation; server computes totals |
| GET | `/quotations` | Authenticated | List quotations and line items |
| PATCH | `/quotations/:id/status` | Sales/Admin | Move draft to sent, then accept/reject |
| POST | `/quotations/:id/convert` | Sales/Admin | Convert accepted quote into one order |
| GET | `/sales-orders` | Authenticated | Orders and current stock summary |
| POST | `/sales-orders/:id/confirm` | Admin | Lock/check stock and reserve quantities |
| POST | `/sales-orders/:id/dispatch` | Admin | Dispatch remaining quantity and decrement stock |
| POST | `/sales-orders/:id/cancel` | Admin | Cancel pending/confirmed order and release reservations |
| GET | `/dispatches` | Admin | List dispatch records |

## Sample payloads

Login:
```json
{"email":"sales@example.com","password":"Sales@123"}
```

Create enquiry:
```json
{
  "customer":{"companyName":"ABC Engineering Pvt. Ltd.","contactPerson":"Asha Shah","mobile":"9876543210","email":"asha@example.com","city":"Pune"},
  "requiredDate":"2026-11-15","notes":"Deliver in two lots if possible",
  "items":[{"productId":1,"quantity":100},{"productId":2,"quantity":40}]
}
```

Create quotation:
```json
{"enquiryId":1,"validUntil":"2026-11-01","items":[{"productId":1,"quantity":100,"discountPct":5,"gstPct":18}]}
```
`unitPrice` may be omitted to use the product master price. Totals supplied by clients are ignored.

Set quotation status:
```json
{"status":"SENT"}
```
Allowed transitions: DRAFT → SENT → ACCEPTED or REJECTED. A DRAFT may be rejected directly.

Dispatch:
```json
{"vehicleNumber":"MH12AB1234","driverName":"Ravi Kumar"}
```

Inventory update:
```json
{"physicalQty":250}
```
Physical stock cannot be set below currently reserved stock.
