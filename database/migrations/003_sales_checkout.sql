-- Run in Supabase SQL Editor after 002. Safe to run more than once.

-- Each pharmacy keeps its own time zone (used for receipt numbers and daily reports)
ALTER TABLE pharmacies ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Lagos';

-- Cash handling, prescription confirmation, and a client reference that stops double-submitted sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_tendered numeric(14,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rx_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_ref uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_client_ref ON sales (pharmacy_id, client_ref) WHERE client_ref IS NOT NULL;

-- Add the "other" payment type shown on the sales screen
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'transfer', 'pos', 'other', 'mixed'));
