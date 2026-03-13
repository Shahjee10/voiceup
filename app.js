const SUPABASE_URL  = 'https://hvsrrkpdnzlynffomnlu.supabase.co';
const SUPABASE_ANON = 'sb_publishable_kKdHvqFvokWh8RRjeP9cOw_8oxrKEK4';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ─── App state ─────────────────────────────────────────── */
const S = { user:null, profile:null, role:null, departments:[], complaints:[], sub:null };
let currentRole = 'employee';
let currentTab  = 'login';

/* ─── Forgot-password state ─────────────────────────────── */
let fpEmail             = '';    // email the user typed in step 1
let resendTimer         = null;  // setInterval handle
let isResettingPassword = false; // flag: blocks onLogin during OTP reset flow

/* ─── Global exposure ───────────────────────────────────── */
Object.assign(window, {
  // existing
  selectRole, switchTab, handleLogin, handleSignup, handleLogout,
  showPage, submitComplaint, openEditModal, saveEdit,
  openStatusModal, saveStatus, closeModal, overlayClick, applyFilters, deleteComplaint,
  // new
  showView, sendOtp, verifyOtp, resendOtp, updatePassword,
  togglePw, checkStrength
});
window.currentTab = currentTab;

/* ════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════ */
async function init() {
  const { data:{ session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') { onLogout(); return; }
    // If we're in the middle of OTP password-reset, never load the app
    if (isResettingPassword) return;
    if (session && !S.user) await onLogin(session.user);
  });

  document.getElementById('complaint-desc').addEventListener('input', function() {
    document.getElementById('char-count').textContent = `${this.value.length} / 1000`;
  });

  /* Wire up the 6 OTP boxes — smart auto-advance & paste */
  wireOtpBoxes();
}

/* ════════════════════════════════════════════════════════
   VIEW SWITCHING — simple helper to show one auth "panel"
   Panels: 'main' | 'fp'
════════════════════════════════════════════════════════ */
function showView(v) {
  document.getElementById('view-main').classList.toggle('hidden', v !== 'main');
  document.getElementById('view-fp').classList.toggle('hidden',   v !== 'fp');

  if (v === 'fp') {
    // Always start at step 1 when entering forgot-password view
    goFpStep(1);
    document.getElementById('fp-email').value = '';
    document.getElementById('fp-email-err').classList.add('hidden');
    clearOtpBoxes();
    clearResendTimer();
  }

  if (v === 'main') {
    // Lower the reset flag so normal login works again
    isResettingPassword = false;
  }
}

/* ════════════════════════════════════════════════════════
   FORGOT PASSWORD — Step navigation helper
════════════════════════════════════════════════════════ */
function goFpStep(step) {
  // Show/hide step panels
  [1, 2, 3].forEach(n => {
    document.getElementById(`fp-s${n}`).classList.toggle('hidden', n !== step);
  });

  // Update progress dots
  [1, 2, 3].forEach(n => {
    const dot = document.getElementById(`prog-dot-${n}`);
    const lbl = document.getElementById(`prog-lbl-${n}`);
    dot.className = 'fp-prog-dot ' + (n < step ? 'done' : n === step ? 'active' : '');
    dot.textContent = n < step ? '✓' : n;
    lbl.className = 'fp-prog-label ' + (n < step ? 'done' : n === step ? 'active' : '');
  });

  // Update connector lines
  [1, 2].forEach(n => {
    document.getElementById(`prog-line-${n}`).classList.toggle('done', step > n);
  });
}

/* ════════════════════════════════════════════════════════
   STEP 1 — Send OTP
   ─────────────────────────────────────────────────────
   HOW THIS ACTUALLY WORKS:
   ─────────────────────────────────────────────────────
   We use resetPasswordForEmail() — this is Supabase's
   password-recovery function. It triggers the "Reset
   Password" email template in your Supabase dashboard.

   By default that template contains a magic link.
   BUT — if you edit the template to include {{ .Token }}
   Supabase will put the 6-digit OTP code in the email
   instead. The user copies that number, types it here,
   and we verify it with type:'recovery'.

   ⚙️  ONE-TIME SETUP (do this once in Supabase):
   ────────────────────────────────────────────────
   1. Supabase Dashboard → Authentication → Email Templates
   2. Click "Reset Password" template
   3. Replace the body with:
      <h2>Reset your VoiceUp password</h2>
      <p>Your OTP code is:</p>
      <h1 style="letter-spacing:8px;font-size:40px;font-weight:bold">
        {{ .Token }}
      </h1>
      <p>Expires in 1 hour. Do not share this code.</p>
   4. Save ✅

   After that, every password-reset email will show a
   plain 6-digit number instead of a link.
════════════════════════════════════════════════════════ */
async function sendOtp() {
  const email = document.getElementById('fp-email').value.trim();

  if (!email || !email.includes('@')) {
    document.getElementById('fp-email-err').classList.remove('hidden');
    return;
  }
  document.getElementById('fp-email-err').classList.add('hidden');

  setBtnLoad('fp-send-btn', true, 'Sending OTP…');

  // resetPasswordForEmail triggers the "Reset Password" email template.
  // With {{ .Token }} in that template, Supabase emails a 6-digit code.
  // We pass a dummy redirectTo so Supabase doesn't complain — the user
  // never actually clicks any link; they type the OTP code instead.
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.href   // required param but never used
  });

  setBtnLoad('fp-send-btn', false, 'Send OTP Code →');

  if (error) {
    toast(error.message, 'error');
    return;
  }

  fpEmail = email;
  document.getElementById('fp-otp-email-display').textContent = email;
  clearOtpBoxes();
  goFpStep(2);
  document.getElementById('otp-0').focus();
  startResendCountdown();
  toast('OTP sent! Check your inbox 📬', 'success');
}

/* ════════════════════════════════════════════════════════
   STEP 2 — Verify OTP
   ─────────────────────────────────────────────────────
   CRITICAL: type must be 'recovery' here — not 'email'.
   resetPasswordForEmail() sends a recovery-type token.
   Using the wrong type causes "invalid OTP" errors even
   when the code is correct. This was the root bug.

   If verified, Supabase creates a session silently.
   We do NOT call onLogin() — we stay on the reset flow
   and use that session only for updateUser() in step 3.
════════════════════════════════════════════════════════ */
async function verifyOtp() {
  const token = [0,1,2,3,4,5,6,7].map(i => document.getElementById(`otp-${i}`).value).join('');

  if (token.length < 8) { toast('Please enter all 8 digits.', 'error'); return; }

  setBtnLoad('fp-verify-btn', true, 'Verifying…');

  // Raise flag BEFORE the API call — onAuthStateChange fires during verifyOtp
  // and we must block onLogin() before that happens
  isResettingPassword = true;

  const { data, error } = await sb.auth.verifyOtp({
    email: fpEmail,
    token,
    type: 'recovery'   // ← MUST be 'recovery' for resetPasswordForEmail OTPs
  });

  setBtnLoad('fp-verify-btn', false, 'Verify OTP →');

  if (error) {
    isResettingPassword = false; // lower flag so back button works normally
    [0,1,2,3,4,5,6,7].forEach(i => {
      const box = document.getElementById(`otp-${i}`);
      box.classList.add('error');
      setTimeout(() => box.classList.remove('error'), 400);
    });
    document.getElementById('otp-err').classList.remove('hidden');
    toast('Invalid OTP code. Please try again.', 'error');
    return;
  }

  // OTP is correct — Supabase has given us a session
  // Store user reference but DON'T call onLogin() yet
  // (we don't want to show the portal, just use the session for updateUser)
  document.getElementById('otp-err').classList.add('hidden');
  clearResendTimer();
  goFpStep(3);
  document.getElementById('new-pw').focus();
  toast('Identity verified ✅ Now set your new password.', 'success');
}

/* ════════════════════════════════════════════════════════
   STEP 3 — Update Password
   ─────────────────────────────────────────────────────
   At this point Supabase has a valid session (from step 2).
   updateUser({ password }) uses that session to change
   the password. Then we sign out and return to login.
════════════════════════════════════════════════════════ */
async function updatePassword() {
  const newPw  = document.getElementById('new-pw').value;
  const confPw = document.getElementById('confirm-pw').value;

  document.getElementById('pw-match-err').classList.add('hidden');
  document.getElementById('pw-len-err').classList.add('hidden');

  if (newPw.length < 8) { document.getElementById('pw-len-err').classList.remove('hidden'); return; }
  if (newPw !== confPw)  { document.getElementById('pw-match-err').classList.remove('hidden'); return; }

  setBtnLoad('fp-update-btn', true, 'Updating password…');

  const { error } = await sb.auth.updateUser({ password: newPw });

  setBtnLoad('fp-update-btn', false, 'Update Password →');

  if (error) { toast(error.message, 'error'); return; }

  // Password updated — sign out, lower flag, return to login
  await sb.auth.signOut();
  isResettingPassword = false;
  fpEmail = '';
  showView('main');
  switchTab('login');
  document.getElementById('login-email').value    = '';
  document.getElementById('login-password').value = '';
}

/* ════════════════════════════════════════════════════════
   RESEND OTP with countdown
════════════════════════════════════════════════════════ */
async function resendOtp() {
  const { error } = await sb.auth.resetPasswordForEmail(fpEmail, {
    redirectTo: window.location.href
  });
  if (error) { toast(error.message, 'error'); return; }
  clearOtpBoxes();
  document.getElementById('otp-err').classList.add('hidden');
  document.getElementById('otp-0').focus();
  startResendCountdown();
  toast('New OTP sent! Check your inbox.', 'success');
}

function startResendCountdown() {
  let secs = 60;
  const secsEl = document.getElementById('resend-secs');
  const btnEl  = document.getElementById('resend-btn');
  btnEl.disabled = true;

  clearResendTimer();
  resendTimer = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(resendTimer); resendTimer = null;
      btnEl.disabled = false;
      btnEl.innerHTML = 'Resend OTP';
    } else {
      secsEl.textContent = secs;
      btnEl.innerHTML = `Resend in <span class="resend-timer-badge"><span id="resend-secs">${secs}</span>s</span>`;
    }
  }, 1000);
}

function clearResendTimer() {
  if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
}

/* ════════════════════════════════════════════════════════
   OTP BOX WIRING
   Auto-advance to next box, handle backspace, handle paste
════════════════════════════════════════════════════════ */
function wireOtpBoxes() {
  for (let i = 0; i < 8; i++) {
    const box = document.getElementById(`otp-${i}`);

    box.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '');   // digits only
      e.target.value = val ? val[val.length - 1] : ''; // keep only 1 digit
      e.target.classList.toggle('filled', !!e.target.value);

      // Auto-advance
      if (e.target.value && i < 5) document.getElementById(`otp-${i + 1}`).focus();

      // Enable/disable verify button
      const full = [0,1,2,3,4,5,6,7].every(n => document.getElementById(`otp-${n}`).value);
      document.getElementById('fp-verify-btn').disabled = !full;
    });

    box.addEventListener('keydown', e => {
      // Backspace — clear current and go back
      if (e.key === 'Backspace' && !e.target.value && i > 0) {
        document.getElementById(`otp-${i - 1}`).focus();
      }
      // Enter when all filled
      if (e.key === 'Enter') {
        const full = [0,1,2,3,4,5,6,7].every(n => document.getElementById(`otp-${n}`).value);
        if (full) verifyOtp();
      }
    });

    // Paste handler — e.g. user copies "123456" and pastes in first box
    box.addEventListener('paste', e => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      if (!pasted) return;
      [...pasted.slice(0, 8)].forEach((ch, idx) => {
        const b = document.getElementById(`otp-${idx}`);
        if (b) { b.value = ch; b.classList.add('filled'); }
      });
      const next = Math.min(pasted.length, 7);
      document.getElementById(`otp-${next}`).focus();
      const full = [0,1,2,3,4,5,6,7].every(n => document.getElementById(`otp-${n}`).value);
      document.getElementById('fp-verify-btn').disabled = !full;
    });
  }
}

function clearOtpBoxes() {
  [0,1,2,3,4,5,6,7].forEach(i => {
    const b = document.getElementById(`otp-${i}`);
    b.value = ''; b.classList.remove('filled','error');
  });
  document.getElementById('fp-verify-btn').disabled = true;
}

/* ════════════════════════════════════════════════════════
   PASSWORD VISIBILITY TOGGLE
════════════════════════════════════════════════════════ */
function togglePw(id, btn) {
  const input = document.getElementById(id); if (!input) return;
  const hidden = input.type === 'password';
  input.type   = hidden ? 'text' : 'password';
  btn.textContent = hidden ? '🙈' : '👁️';
}

/* ════════════════════════════════════════════════════════
   PASSWORD STRENGTH METER
════════════════════════════════════════════════════════ */
function checkStrength(val,
  fillId   = 'signup-strength-fill',
  textId   = 'signup-strength-text',
  wrapId   = 'signup-strength') {
  const wrap = document.getElementById(wrapId); if (!wrap) return;
  if (!val) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  let score = 0;
  if (val.length >= 8)          score++;
  if (/[A-Z]/.test(val))        score++;
  if (/[0-9]/.test(val))        score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const lvls = [
    { t:'Too short', c:'#EF4444', p:'15%' },
    { t:'Weak',      c:'#F97316', p:'35%' },
    { t:'Fair',      c:'#F59E0B', p:'60%' },
    { t:'Good',      c:'#3B82F6', p:'80%' },
    { t:'Strong 💪', c:'#22C55E', p:'100%' }
  ];
  const l = lvls[score] || lvls[0];
  const f = document.getElementById(fillId); const t = document.getElementById(textId);
  if (f) { f.style.width = l.p; f.style.background = l.c; }
  if (t) { t.textContent = l.t; t.style.color = l.c; }
}

/* ════════════════════════════════════════════════════════
   ALL EXISTING FUNCTIONS — UNCHANGED
════════════════════════════════════════════════════════ */
function selectRole(r) {
  currentRole = r;
  document.getElementById('role-employee').classList.toggle('active', r === 'employee');
  document.getElementById('role-admin').classList.toggle('active', r === 'admin');
}

function switchTab(tab) {
  currentTab = tab; window.currentTab = tab;
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('signup-form').classList.toggle('hidden', tab !== 'signup');
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab !== 'login');
  document.getElementById('switch-text').textContent = tab === 'login' ? "Don't have an account?" : "Already have an account?";
  document.getElementById('switch-link').textContent = tab === 'login' ? 'Sign up' : 'Sign in';
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) { toast('Please fill in all fields.', 'error'); return; }

  setBtnLoad('login-btn', true, 'Signing in…');
  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  setBtnLoad('login-btn', false, 'Sign In →');
  if (error) { toast(error.message, 'error'); return; }

  const uid = data.user.id;
  if (currentRole === 'employee') {
    const { data: adminRow } = await sb.from('admin_users').select('id').eq('id', uid).single();
    if (adminRow)  { await sb.auth.signOut(); toast('This account belongs to an Admin. Please select the Admin role.', 'error'); return; }
    const { data: empRow } = await sb.from('employees').select('id').eq('id', uid).single();
    if (!empRow)   { await sb.auth.signOut(); toast('No employee profile found for this account.', 'error'); return; }
  }
  if (currentRole === 'admin') {
    const { data: adminRow } = await sb.from('admin_users').select('id').eq('id', uid).single();
    if (!adminRow) { await sb.auth.signOut(); toast('This account is not an Admin. Please select the Employee role.', 'error'); return; }
  }
}

async function handleSignup() {
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  if (!name)                          { toast('Please enter your full name.', 'error'); return; }
  if (!email || !email.includes('@')) { toast('Please enter a valid email.', 'error'); return; }
  if (pass.length < 6)                { toast('Password must be at least 6 characters.', 'error'); return; }

  // Check if user already exists
  const { data: exists, error: checkError } = await sb.rpc('check_email_exists', { email_input: email });
  if (checkError) {
    toast('Error checking email. Please try again.', 'error');
    return;
  }
  if (exists) {
    toast('User already exists with this email.', 'error');
    return;
  }

  setBtnLoad('signup-btn', true, 'Creating account…');
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { full_name: name, role: currentRole } } });
  setBtnLoad('signup-btn', false, 'Create Account →');
  if (error) toast(error.message, 'error');
  else       toast('Account created! Check your email to confirm.', 'success');
}

async function handleLogout() {
  await sb.auth.signOut();
  onLogout();
}

async function onLogin(user) {
  // isResettingPassword flag blocks this during OTP reset flow
  if (isResettingPassword) return;

  S.user = user;
  const { data: adminRow } = await sb.from('admin_users').select('*').eq('id', user.id).single();
  if (adminRow) { S.role = 'admin'; S.profile = adminRow; }
  else {
    const { data: empRow } = await sb.from('employees').select('*').eq('id', user.id).single();
    S.role = 'employee'; S.profile = empRow || { full_name: user.email, email: user.email };
  }
  await loadDepartments();
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  const name = S.profile?.full_name || 'User';
  document.getElementById('sb-name').textContent     = name;
  document.getElementById('sb-email').textContent    = S.profile?.email || '';
  document.getElementById('sb-avatar').textContent   = name.charAt(0).toUpperCase();
  document.getElementById('sb-role-text').textContent = S.role === 'admin' ? 'Admin' : 'Employee';
  document.getElementById('employee-nav').classList.toggle('hidden', S.role !== 'employee');
  document.getElementById('admin-nav').classList.toggle('hidden', S.role !== 'admin');
  showPage(S.role === 'admin' ? 'admin-dashboard' : 'my-complaints');
  setupRealtime();
  toast(`Welcome back, ${name.split(' ')[0]}! 👋`, 'success');
}

function onLogout() {
  S.user = S.profile = S.role = null;
  if (S.sub) sb.removeChannel(S.sub);
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  showView('main');
}

function setupRealtime() {
  if (S.sub) sb.removeChannel(S.sub);
  S.sub = sb.channel('complaints-rt')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'complaints' }, () => {
      if (S.role === 'employee') loadMyComplaints();
      else { loadAdminDashboard(); loadAllComplaints(); }
    }).subscribe();
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById(`page-${id}`)?.classList.remove('hidden');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  if      (id === 'my-complaints')    loadMyComplaints();
  else if (id === 'all-complaints')   loadAllComplaints();
  else if (id === 'admin-dashboard')  loadAdminDashboard();
  else if (id === 'submit-complaint') loadDepartments();
}

async function loadDepartments() {
  const { data } = await sb.from('departments').select('*').order('name');
  S.departments = data || [];
  ['complaint-dept','edit-dept','status-dept','filter-dept'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    const isFilter = id === 'filter-dept';
    el.innerHTML = `<option value="">${isFilter ? 'All Departments' : 'Select department…'}</option>`;
    S.departments.forEach(d => { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; el.appendChild(o); });
  });
}
const deptName = id => S.departments.find(d => d.id === id)?.name || '—';

async function loadMyComplaints() {
  const { data, error } = await sb.from('complaints').select('*').eq('employee_id', S.user.id).order('created_at', { ascending: false });
  if (error) { toast('Failed to load complaints.', 'error'); return; }
  S.complaints = data || []; renderMine(S.complaints);
}

function renderMine(list) {
  const el = document.getElementById('my-complaints-list');
  if (!list.length) { el.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><h3>Nothing here yet</h3><p>You haven't submitted any complaints.<br><a href="#" onclick="showPage('submit-complaint');return false" style="color:var(--blue);font-weight:600">Submit your first one →</a></p></div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="c-card">
      <div class="c-header"><div><div class="c-title">${esc(c.title)}</div><div class="c-badges">${sBadge(c.status)} ${tBadge(c.type)}</div></div></div>
      <div class="c-meta"><span class="c-meta-item">🏢 ${deptName(c.department_id)}</span><span class="c-meta-item">📅 ${fmtDate(c.created_at)}</span>${c.is_anonymous ? '<span class="c-meta-item">🎭 Anonymous</span>' : ''}</div>
      <div class="c-desc">${esc(c.description)}</div>
      ${c.admin_notes ? `<div class="admin-note"><div class="admin-note-icon">📌</div><div><div class="admin-note-label">Admin Update</div><div class="admin-note-text">${esc(c.admin_notes)}</div></div></div>` : ''}
      ${c.status === 'Pending' ? `<div class="c-actions"><button class="btn btn-ghost btn-sm" onclick="openEditModal('${c.id}')">✏️ Edit</button><button class="btn btn-danger btn-sm" onclick="deleteComplaint('${c.id}')">🗑 Delete</button></div>` : ''}
    </div>`).join('');
}

async function submitComplaint() {
  const title = document.getElementById('complaint-title').value.trim();
  const desc  = document.getElementById('complaint-desc').value.trim();
  const type  = document.getElementById('complaint-type').value;
  const dept  = document.getElementById('complaint-dept').value;
  const anon  = document.getElementById('complaint-anon').checked;
  let ok = true;
  ['err-title','err-desc'].forEach(id => document.getElementById(id).classList.add('hidden'));
  if (!title)           { document.getElementById('err-title').classList.remove('hidden'); ok = false; }
  if (desc.length < 20) { document.getElementById('err-desc').classList.remove('hidden');  ok = false; }
  if (!ok) return;
  setBtnLoad('submit-btn', true, 'Submitting…');
  const { error } = await sb.from('complaints').insert({ employee_id: S.user.id, department_id: dept || null, title, description: desc, type, is_anonymous: anon, status: 'Pending' });
  setBtnLoad('submit-btn', false, 'Submit Complaint →');
  if (error) { toast('Failed to submit: ' + error.message, 'error'); return; }
  toast('Complaint submitted! 🎉', 'success');
  document.getElementById('complaint-title').value = '';
  document.getElementById('complaint-desc').value  = '';
  document.getElementById('char-count').textContent = '0 / 1000';
  document.getElementById('complaint-anon').checked = false;
  showPage('my-complaints');
}

function openEditModal(id) {
  const c = S.complaints.find(x => x.id === id); if (!c) return;
  document.getElementById('edit-id').value    = c.id;
  document.getElementById('edit-title').value = c.title;
  document.getElementById('edit-desc').value  = c.description;
  loadDepartments().then(() => { document.getElementById('edit-dept').value = c.department_id || ''; });
  document.getElementById('edit-modal').classList.remove('hidden');
}
async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const desc  = document.getElementById('edit-desc').value.trim();
  const dept  = document.getElementById('edit-dept').value;
  if (!title || desc.length < 20) { toast('Please fill all fields correctly.', 'error'); return; }
  const { error } = await sb.from('complaints').update({ title, description: desc, department_id: dept || null }).eq('id', id).eq('employee_id', S.user.id).eq('status', 'Pending');
  if (error) toast('Update failed: ' + error.message, 'error');
  else { toast('Complaint updated!', 'success'); closeModal('edit-modal'); loadMyComplaints(); }
}

async function deleteComplaint(id) {
  if (!confirm('Delete this complaint? This cannot be undone.')) return;
  const { error } = await sb.from('complaints').delete().eq('id', id).eq('employee_id', S.user.id).eq('status', 'Pending');
  if (error) toast('Delete failed: ' + error.message, 'error');
  else { toast('Complaint deleted.', 'info'); loadMyComplaints(); }
}

async function loadAdminDashboard() {
  const { data } = await sb.from('complaints').select('status, created_at, title, type, id').order('created_at', { ascending: false });
  const all = data || [];
  const count = s => all.filter(c => c.status === s).length;
  document.getElementById('stat-total').textContent    = all.length;
  document.getElementById('stat-pending').textContent  = count('Pending');
  document.getElementById('stat-progress').textContent = count('In Progress');
  document.getElementById('stat-resolved').textContent = count('Resolved');
  const el = document.getElementById('dash-recent');
  const recent = all.slice(0, 3);
  if (!recent.length) { el.innerHTML = '<p class="muted text-sm">No complaints yet.</p>'; return; }
  el.innerHTML = recent.map(c => `<div class="c-card card-sm" style="margin-bottom:10px"><div class="c-header"><div class="c-title" style="font-size:14px">${esc(c.title)}</div><div>${sBadge(c.status)}</div></div><div class="c-meta" style="margin-top:8px"><span class="c-meta-item">📅 ${fmtDate(c.created_at)}</span><span class="c-meta-item">${tBadge(c.type)}</span></div></div>`).join('');
}

async function loadAllComplaints() {
  const { data, error } = await sb.from('complaints').select('*, employees(full_name,email), departments(name)').order('created_at', { ascending: false });
  if (error) { toast('Failed to load.', 'error'); return; }
  S.complaints = data || []; applyFilters();
}

function applyFilters() {
  const sf = document.getElementById('filter-status')?.value || '';
  const df = document.getElementById('filter-dept')?.value   || '';
  const tf = document.getElementById('filter-type')?.value   || '';
  let list = S.complaints;
  if (sf) list = list.filter(c => c.status === sf);
  if (df) list = list.filter(c => c.department_id === df);
  if (tf) list = list.filter(c => c.type === tf);
  const countEl = document.getElementById('filter-count');
  if (countEl) countEl.textContent = `${list.length} complaint${list.length !== 1 ? 's' : ''}`;
  renderAdmin(list);
}

function renderAdmin(list) {
  const el = document.getElementById('all-complaints-list');
  if (!list.length) { el.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><h3>No results</h3><p>No complaints match the selected filters.</p></div>`; return; }
  el.innerHTML = list.map(c => `
    <div class="c-card">
      <div class="c-header"><div style="flex:1"><div class="c-title">${esc(c.title)}</div><div class="c-badges">${sBadge(c.status)} ${tBadge(c.type)}</div></div><button class="btn btn-ghost btn-sm" onclick="openStatusModal('${c.id}')">⚙️ Update</button></div>
      <div class="c-meta"><span class="c-meta-item">👤 ${c.is_anonymous ? '🎭 Anonymous' : esc(c.employees?.full_name || '—')}</span><span class="c-meta-item">🏢 ${c.departments?.name || deptName(c.department_id)}</span><span class="c-meta-item">📅 ${fmtDate(c.created_at)}</span><span class="c-meta-item">🔄 Updated ${fmtDate(c.updated_at)}</span></div>
      <div class="c-desc">${esc(c.description)}</div>
      ${c.admin_notes ? `<div class="admin-note"><div class="admin-note-icon">📌</div><div><div class="admin-note-label">Admin Notes</div><div class="admin-note-text">${esc(c.admin_notes)}</div></div></div>` : ''}
    </div>`).join('');
}

function openStatusModal(id) {
  const c = S.complaints.find(x => x.id === id); if (!c) return;
  document.getElementById('status-modal-id').value = c.id;
  document.getElementById('status-value').value    = c.status;
  document.getElementById('status-notes').value    = c.admin_notes || '';
  loadDepartments().then(() => { document.getElementById('status-dept').value = c.department_id || ''; });
  document.getElementById('status-modal').classList.remove('hidden');
}
async function saveStatus() {
  const id     = document.getElementById('status-modal-id').value;
  const status = document.getElementById('status-value').value;
  const notes  = document.getElementById('status-notes').value.trim();
  const dept   = document.getElementById('status-dept').value;
  const { error } = await sb.from('complaints').update({ status, admin_notes: notes || null, department_id: dept || null, admin_id: S.user.id }).eq('id', id);
  if (error) toast('Update failed: ' + error.message, 'error');
  else { toast(`Status → "${status}" ✅`, 'success'); closeModal('status-modal'); loadAllComplaints(); loadAdminDashboard(); }
}

function closeModal(id)  { document.getElementById(id)?.classList.add('hidden'); }
function overlayClick(e,id) { if (e.target === e.currentTarget) closeModal(id); }

function setBtnLoad(id, loading, txt) {
  const b = document.getElementById(id); if (!b) return;
  b.disabled = loading;
  b.innerHTML = loading ? `<span class="spin" style="width:16px;height:16px;border-width:2px"></span> ${txt}` : txt;
}

function toast(msg, type = 'info') {
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function sBadge(s) { const m={'Pending':'b-pending','In Progress':'b-progress','Resolved':'b-resolved','Rejected':'b-rejected'}; return `<span class="badge ${m[s]||''}">${s}</span>`; }
function tBadge(t) { const m={'Complaint':'b-complaint','Feedback':'b-feedback','Suggestion':'b-suggestion'}; return `<span class="badge ${m[t]||''}">${t}</span>`; }
function fmtDate(s) { if (!s) return '—'; return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
function esc(s) { if (!s) return ''; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

init();

