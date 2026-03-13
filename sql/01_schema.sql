-- ============================================================
-- EMPLOYEE FEEDBACK & COMPLAINT PORTAL
-- Supabase Database Schema
-- ============================================================
-- HOW TO USE:
-- 1. Go to your Supabase project dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Paste this entire file and click "Run"
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- STEP 1: CREATE DEPARTMENTS TABLE
-- This stores all departments like HR, Finance, Automation, etc.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,           -- Department name (must be unique)
  description TEXT,                           -- Optional description
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default departments right away
INSERT INTO public.departments (name, description) VALUES
  ('Human Resources',  'HR policies, recruitment, and employee welfare'),
  ('Finance',          'Payroll, reimbursements, and budget concerns'),
  ('Automation & IT',  'Software, hardware, and automation issues'),
  ('Operations',       'Day-to-day operational concerns'),
  ('Management',       'Leadership and management-related feedback')
ON CONFLICT (name) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- STEP 2: CREATE EMPLOYEES TABLE
-- This extends Supabase's built-in auth.users table.
-- When someone signs up, we store their profile here.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.employees (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  employee_code TEXT UNIQUE,                  -- Optional: company employee ID
  avatar_url    TEXT,                         -- Optional: profile picture URL
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 3: CREATE ADMIN_USERS TABLE
-- Admins are also in auth.users but flagged separately here.
-- This is safer than relying on just roles.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 4: CREATE COMPLAINTS TABLE
-- The core table! This stores all feedback and complaints.
-- ─────────────────────────────────────────────────────────────
CREATE TYPE complaint_status AS ENUM ('Pending', 'In Progress', 'Resolved', 'Rejected');
CREATE TYPE complaint_type   AS ENUM ('Complaint', 'Feedback', 'Suggestion');

CREATE TABLE IF NOT EXISTS public.complaints (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  department_id   UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  type            complaint_type   NOT NULL DEFAULT 'Complaint',
  status          complaint_status NOT NULL DEFAULT 'Pending',
  admin_notes     TEXT,                       -- Admin can add internal notes
  is_anonymous    BOOLEAN DEFAULT FALSE,      -- Employee can hide their name
  admin_id        UUID REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ─────────────────────────────────────────────────────────────
-- STEP 5: AUTO-UPDATE updated_at TIMESTAMP
-- Every time a row is changed, updated_at is set automatically.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_employees
  BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_complaints
  BEFORE UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ─────────────────────────────────────────────────────────────
-- STEP 6: FUNCTION TO CHECK IF EMAIL EXISTS
-- Used in signup to prevent duplicate accounts
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_email_exists(email_input TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE email = email_input
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────
-- STEP 7: AUTO-CREATE EMPLOYEE PROFILE ON SIGNUP
-- When a new user signs up through Supabase Auth,
-- this function automatically creates their employee record.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-create employee if role metadata says 'employee'
  IF NEW.raw_user_meta_data->>'role' = 'employee' THEN
    INSERT INTO public.employees (id, full_name, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Employee'),
      NEW.email
    );
  END IF;

  -- Auto-create admin profile if role is 'admin'
  IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
    INSERT INTO public.admin_users (id, full_name, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', 'Admin'),
      NEW.email
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Hook the function to fire on every new user creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- STEP 8: HELPER FUNCTION - Check if current user is admin
-- Used in RLS policies below
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
