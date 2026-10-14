CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('ADMIN','SALES_USER')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customers (
 id BIGSERIAL PRIMARY KEY, company_name TEXT NOT NULL, contact_person TEXT NOT NULL,
 mobile TEXT NOT NULL, email TEXT NOT NULL, city TEXT NOT NULL,
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS products (
 id BIGSERIAL PRIMARY KEY, product_code TEXT NOT NULL UNIQUE, product_name TEXT NOT NULL,
 category TEXT NOT NULL, unit TEXT NOT NULL, base_price NUMERIC(12,2) NOT NULL CHECK(base_price >= 0),
 active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS inventory (
 product_id BIGINT PRIMARY KEY REFERENCES products(id), physical_qty INTEGER NOT NULL DEFAULT 0 CHECK(physical_qty >= 0),
 reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK(reserved_qty >= 0 AND reserved_qty <= physical_qty),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS enquiries (
 id BIGSERIAL PRIMARY KEY, enquiry_number TEXT NOT NULL UNIQUE, customer_id BIGINT NOT NULL REFERENCES customers(id),
 enquiry_date DATE NOT NULL DEFAULT CURRENT_DATE, required_date DATE, notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','QUOTED','WON','LOST')),
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS enquiry_items (
 id BIGSERIAL PRIMARY KEY, enquiry_id BIGINT NOT NULL REFERENCES enquiries(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE TABLE IF NOT EXISTS quotations (
 id BIGSERIAL PRIMARY KEY, quotation_number TEXT NOT NULL UNIQUE, enquiry_id BIGINT NOT NULL REFERENCES enquiries(id),
 customer_id BIGINT NOT NULL REFERENCES customers(id), valid_until DATE, status TEXT NOT NULL DEFAULT 'DRAFT'
 CHECK(status IN ('DRAFT','SENT','ACCEPTED','REJECTED')),
 subtotal NUMERIC(14,2) NOT NULL DEFAULT 0, discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
 gst_total NUMERIC(14,2) NOT NULL DEFAULT 0, grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
 created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS quotation_items (
 id BIGSERIAL PRIMARY KEY, quotation_id BIGINT NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_price NUMERIC(12,2) NOT NULL CHECK(unit_price >= 0), discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK(discount_pct BETWEEN 0 AND 100),
 gst_pct NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK(gst_pct BETWEEN 0 AND 100),
 base_amount NUMERIC(14,2) NOT NULL, discount_amount NUMERIC(14,2) NOT NULL,
 taxable_amount NUMERIC(14,2) NOT NULL, gst_amount NUMERIC(14,2) NOT NULL, line_amount NUMERIC(14,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS sales_orders (
 id BIGSERIAL PRIMARY KEY, order_number TEXT NOT NULL UNIQUE, quotation_id BIGINT NOT NULL UNIQUE REFERENCES quotations(id),
 customer_id BIGINT NOT NULL REFERENCES customers(id), order_date DATE NOT NULL DEFAULT CURRENT_DATE,
 total_amount NUMERIC(14,2) NOT NULL, status TEXT NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','CONFIRMED','DISPATCHED','CANCELLED')),
 created_by BIGINT REFERENCES users(id), confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sales_order_items (
 id BIGSERIAL PRIMARY KEY, sales_order_id BIGINT NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
 dispatched_qty INTEGER NOT NULL DEFAULT 0 CHECK(dispatched_qty >= 0 AND dispatched_qty <= quantity),
 unit_price NUMERIC(12,2) NOT NULL, line_amount NUMERIC(14,2) NOT NULL
);
CREATE TABLE IF NOT EXISTS dispatches (
 id BIGSERIAL PRIMARY KEY, dispatch_number TEXT NOT NULL UNIQUE,
 sales_order_id BIGINT NOT NULL UNIQUE REFERENCES sales_orders(id), dispatch_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 vehicle_number TEXT NOT NULL, driver_name TEXT NOT NULL, created_by BIGINT REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS dispatch_items (
 id BIGSERIAL PRIMARY KEY, dispatch_id BIGINT NOT NULL REFERENCES dispatches(id) ON DELETE CASCADE,
 product_id BIGINT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_enquiry ON quotations(enquiry_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON sales_orders(status);
