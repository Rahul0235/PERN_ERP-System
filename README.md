# PERN ERP — Industrial Sales Workflow

A full-stack ERP case study implementing **Customer Enquiry → Quotation → Sales Order → Inventory Reservation → Dispatch** with PostgreSQL, Express, React and Node.js. The backend owns pricing calculations, permissions, stock reservation and dispatch rules.

## Stack
- PostgreSQL relational schema, foreign keys, check constraints, unique constraints and transactions
- Node.js + Express REST API, `pg`, JWT, bcryptjs, Helmet, CORS and rate limiting
- React + Vite responsive UI
- Node's built-in test runner

## Prerequisites
- Node.js 20 or newer
- PostgreSQL 14 or newer
- npm

## Setup

### 1. Create database
```sql
CREATE DATABASE pern_erp;
```

### 2. Configure backend
```bash
cd server
cp .env.example .env
```
Edit `server/.env`, setting `DATABASE_URL` and a long random `JWT_SECRET`.

### 3. Create tables and sample data
```bash
npm install
npm run db:migrate
npm run db:seed
```
This seeds six industrial products, stock records, and two demo users:
- Admin: `admin@example.com` / `Admin@123`
- Sales: `sales@example.com` / `Sales@123`

Change these credentials and the JWT secret before deploying anywhere public.

### 4. Start API
```bash
npm run dev
```
API: `http://localhost:8080/api`; health check: `http://localhost:8080/api/health`.

### 5. Start React client (new terminal)
```bash
cd client
cp .env.example .env
npm install
npm run dev
```
Open `http://localhost:5173`.

### 6. Run tests
```bash
cd server
npm test
```
Tests cover server-side quotation math, conversion guards, duplicate-order prevention, available-stock validation and role restrictions. They are unit tests for the same business-rule functions used by the API. For final verification, also run the end-to-end workflow against a local PostgreSQL database.

## Workflow
1. Log in as Sales and create an enquiry (customer details plus one or more product lines).
2. Create a quotation from an enquiry. The API fetches product master prices and calculates line values, discounts, GST and grand total; it does not trust a frontend total.
3. Mark a draft as SENT, then Accept or Reject it.
4. Convert an ACCEPTED quotation to a Sales Order. The database's unique `sales_orders.quotation_id` constraint and transaction prevent duplicate conversion.
5. Log in as Admin. Confirm a PENDING order to reserve stock. Inventory rows are locked with `SELECT ... FOR UPDATE`, and available quantity is checked inside one transaction. Physical quantity does not change during reservation.
6. Dispatch a CONFIRMED order. The transaction creates one dispatch record, decreases physical and reserved quantities together, and marks the order DISPATCHED.
7. Admin can cancel PENDING or CONFIRMED orders; for confirmed orders, remaining reservations are released.

## Roles
| Operation | Sales user | Admin |
|---|---:|---:|
| View products/inventory | Yes | Yes |
| Create enquiry/quotation | Yes | Yes |
| Accept/reject quotation and convert accepted quotation | Yes | Yes |
| Update physical inventory | No | Yes |
| Confirm order/reserve stock | No | Yes |
| Dispatch/cancel order | No | Yes |

All `/api` routes except login and health check require a bearer JWT. Role checks are enforced by Express middleware, not only by hiding UI controls.

## Data model
See `docs/ER-DIAGRAM.md` and `server/db/schema.sql`. Business records use relational tables rather than storing workflow state in JSON. Inventory `available_qty` is derived as `physical_qty - reserved_qty`.

## API documentation
See `docs/API.md` for endpoints and sample payloads. Import `docs/PERN-ERP.postman_collection.json` into Postman for a starter request collection. Replace the login token variable after logging in.

## Known implementation notes
- The case study only requests one dispatch per order; `dispatches.sales_order_id` is unique and the API dispatches all remaining order quantities in one transaction.
- Enquiry/customer creation and quotation line creation are transactional.
- Stock reservation locks product inventory rows in product-id order to reduce deadlock risk under concurrent requests.
- The application intentionally keeps UI straightforward; backend integrity and workflow correctness are the priority.
- Use HTTPS, strong secrets, managed database credentials, migrations, audit logs and production-grade validation before production use.
