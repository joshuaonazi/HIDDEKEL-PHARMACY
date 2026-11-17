-- Run in Supabase SQL Editor after 003. Safe to run more than once.

-- New or reset accounts must choose their own password at first login
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- Raised whenever a password changes or an account is deactivated, which signs that user out everywhere
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;
