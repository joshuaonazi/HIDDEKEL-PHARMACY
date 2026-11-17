-- Pharmacy POS: Version 1 schema (PostgreSQL 13+)
-- Every business table carries pharmacy_id so reselling to other pharmacies later is a configuration step.

CREATE TABLE pharmacies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  address        text,
  phone          text,
  logo_url       text,
  currency       text NOT NULL DEFAULT 'NGN',      -- change per client
  tax_rate       numeric(5,2) NOT NULL DEFAULT 0,
  receipt_footer text DEFAULT 'Thank you for your patronage',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   uuid NOT NULL REFERENCES pharmacies(id),
  full_name     text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin','manager','cashier')),
  is_active     boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  parent_id   uuid REFERENCES categories(id),       -- allows subcategories
  name        text NOT NULL,
  UNIQUE (pharmacy_id, parent_id, name)
);

CREATE TABLE products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id          uuid NOT NULL REFERENCES pharmacies(id),
  category_id          uuid REFERENCES categories(id),
  item_type            text NOT NULL DEFAULT 'drug' CHECK (item_type IN ('drug','general')),
  name                 text NOT NULL,               -- brand / display name
  generic_name         text,
  strength             text,                        -- e.g. 500mg (drugs only)
  dosage_form          text,                        -- tablet, syrup, injection...
  manufacturer         text,
  reg_number           text,                        -- regulatory registration number
  requires_prescription boolean NOT NULL DEFAULT false,
  reorder_level        integer NOT NULL DEFAULT 0,  -- low-stock threshold
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- One product can have several barcodes (different packs or manufacturers)
CREATE TABLE product_barcodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  product_id  uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode     text NOT NULL,
  UNIQUE (pharmacy_id, barcode)
);

CREATE TABLE suppliers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  name        text NOT NULL,
  phone       text,
  address     text
);

CREATE TABLE purchases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   uuid NOT NULL REFERENCES pharmacies(id),
  supplier_id   uuid REFERENCES suppliers(id),
  invoice_no    text,
  purchase_date date NOT NULL DEFAULT current_date,
  total_cost    numeric(14,2) NOT NULL DEFAULT 0,
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Stock lives in batches. Cost price is stored here because it changes per delivery.
CREATE TABLE batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   uuid NOT NULL REFERENCES pharmacies(id),
  product_id    uuid NOT NULL REFERENCES products(id),
  purchase_id   uuid REFERENCES purchases(id),
  batch_no      text,
  expiry_date   date,                               -- stored now, alerts come in v2
  qty_received  integer NOT NULL CHECK (qty_received >= 0),
  qty_remaining integer NOT NULL CHECK (qty_remaining >= 0),
  cost_price    numeric(12,2) NOT NULL CHECK (cost_price >= 0),
  selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sales (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  receipt_no  text NOT NULL,
  cashier_id  uuid NOT NULL REFERENCES users(id),
  subtotal    numeric(14,2) NOT NULL,
  discount    numeric(14,2) NOT NULL DEFAULT 0,
  tax         numeric(14,2) NOT NULL DEFAULT 0,
  total       numeric(14,2) NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','transfer','pos','mixed')),
  status      text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','voided','refunded')),
  void_reason text,
  voided_by   uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pharmacy_id, receipt_no)
);

-- Cost and selling price are copied onto each line at the moment of sale,
-- so later price changes never distort old profit reports.
CREATE TABLE sale_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id    uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  batch_id   uuid NOT NULL REFERENCES batches(id),
  quantity   integer NOT NULL CHECK (quantity > 0),
  unit_cost  numeric(12,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  line_total numeric(14,2) NOT NULL
);

CREATE TABLE stock_adjustments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  batch_id    uuid NOT NULL REFERENCES batches(id),
  change_qty  integer NOT NULL,
  reason      text NOT NULL,                        -- damaged, expired, count correction...
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  user_id     uuid REFERENCES users(id),
  action      text NOT NULL,                        -- e.g. 'price_change', 'sale_void'
  entity      text,
  entity_id   uuid,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast scanning and reporting
CREATE INDEX idx_barcodes_lookup   ON product_barcodes (pharmacy_id, barcode);
CREATE INDEX idx_products_name     ON products (pharmacy_id, name);
CREATE INDEX idx_batches_product   ON batches (product_id, expiry_date);
CREATE INDEX idx_sales_date        ON sales (pharmacy_id, created_at);
CREATE INDEX idx_sale_items_sale   ON sale_items (sale_id);
CREATE INDEX idx_sale_items_prod   ON sale_items (product_id);

-- Profit report: per day and product (completed sales only)
CREATE VIEW v_daily_product_profit AS
SELECT s.pharmacy_id,
       s.created_at::date                          AS sale_date,
       si.product_id,
       SUM(si.quantity)                            AS qty_sold,
       SUM(si.unit_cost * si.quantity)             AS total_cost,
       SUM(si.line_total)                          AS revenue,
       SUM(si.line_total - si.unit_cost * si.quantity) AS profit
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
WHERE s.status = 'completed'
GROUP BY s.pharmacy_id, s.created_at::date, si.product_id;
