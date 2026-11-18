-- Run after 004_user_management.sql.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'manager', 'cashier', 'pharmacist'));

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  pharmacist_id uuid NOT NULL REFERENCES users(id),
  customer_name text NOT NULL,
  customer_phone text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'dispensed', 'cancelled')),
  source_prescription_id uuid REFERENCES prescriptions(id),
  sale_id uuid REFERENCES sales(id),
  dispensed_by uuid REFERENCES users(id),
  dispensed_at timestamptz,
  cancelled_by uuid REFERENCES users(id),
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  directions text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_pharmacy_status
  ON prescriptions (pharmacy_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_customer
  ON prescriptions (pharmacy_id, lower(customer_name), customer_phone);
CREATE INDEX IF NOT EXISTS idx_prescription_items_product
  ON prescription_items (prescription_id, product_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES prescriptions(id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_prescription
  ON sales (prescription_id) WHERE prescription_id IS NOT NULL;

-- The Express backend connects as the database owner and bypasses RLS.
-- Enabling RLS blocks direct public/Supabase API access, for which no policies are defined.
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
