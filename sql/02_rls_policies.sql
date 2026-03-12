-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
-- RLS is like a bouncer at a club. Even if someone sends a
-- correct database query, RLS checks WHO is asking and blocks
-- unauthorized access automatically.
--
-- Run this file AFTER 01_schema.sql
-- ============================================================


-- ─────────────────────────────────────────────────────────────
-- ENABLE RLS ON ALL TABLES
-- By default, tables are open. We lock them down first,
-- then selectively open specific access through policies.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.departments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaints   ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────
-- DEPARTMENTS: Anyone logged in can READ departments
-- (needed so employees can pick a department when submitting)
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Anyone logged in can view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can create/edit/delete departments
CREATE POLICY "Admins can manage departments"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.is_admin());


-- ─────────────────────────────────────────────────────────────
-- EMPLOYEES: Employees see only their own profile
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Employees can view own profile"
  ON public.employees FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()       -- Employee sees their own row
    OR public.is_admin()  -- Admin sees all employees
  );

CREATE POLICY "Employees can update own profile"
  ON public.employees FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "System can insert employee profiles"
  ON public.employees FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- ADMIN_USERS: Only admins can see the admin table
-- ─────────────────────────────────────────────────────────────
CREATE POLICY "Only admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "System can insert admin profiles"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());


-- ─────────────────────────────────────────────────────────────
-- COMPLAINTS: The most important policies!
-- ─────────────────────────────────────────────────────────────

-- SELECT: Employees see ONLY their own complaints; Admins see ALL
CREATE POLICY "Employees see own complaints, admins see all"
  ON public.complaints FOR SELECT
  TO authenticated
  USING (
    employee_id = auth.uid()   -- "Is this complaint mine?"
    OR public.is_admin()       -- "Or am I an admin?"
  );

-- INSERT: Only employees can submit complaints (not admins)
CREATE POLICY "Employees can submit complaints"
  ON public.complaints FOR INSERT
  TO authenticated
  WITH CHECK (
    employee_id = auth.uid()   -- Must be submitting for yourself
    AND NOT public.is_admin()  -- Admins can't submit complaints
  );

-- UPDATE: Employees can edit ONLY if status is still Pending
--         Admins can update any complaint (to change status, add notes)
CREATE POLICY "Employees edit own pending complaints, admins edit all"
  ON public.complaints FOR UPDATE
  TO authenticated
  USING (
    (employee_id = auth.uid() AND status = 'Pending')
    OR public.is_admin()
  )
  WITH CHECK (
    (employee_id = auth.uid() AND status = 'Pending')
    OR public.is_admin()
  );

-- DELETE: Only employees can delete their own pending complaints
CREATE POLICY "Employees can delete own pending complaints"
  ON public.complaints FOR DELETE
  TO authenticated
  USING (
    employee_id = auth.uid()
    AND status = 'Pending'
  );


-- ─────────────────────────────────────────────────────────────
-- ENABLE REALTIME for complaints table
-- This lets the frontend "listen" for changes automatically.
-- When admin updates a complaint, employees see it instantly!
-- ─────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
