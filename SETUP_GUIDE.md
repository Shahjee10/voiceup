# VoiceUp — Employee Feedback & Complaint Portal
## Complete Setup Guide (Beginner-Friendly)

---

## 📁 What You Got

```
feedback-portal/
├── index.html              ← The entire frontend app (open this in browser)
├── sql/
│   ├── 01_schema.sql       ← Creates all database tables
│   └── 02_rls_policies.sql ← Security rules (who can see what)
└── SETUP_GUIDE.md          ← You're reading this!
```

---

## 🚀 Step-by-Step Setup

### Step 1: Create a Supabase Account
1. Go to **https://supabase.com** and click "Start your project"
2. Sign in with GitHub or create an account
3. Click **"New Project"** → give it a name like `feedback-portal`
4. Set a **strong database password** (save it somewhere!)
5. Choose a region closest to you
6. Wait ~2 minutes while Supabase sets up your database

---

### Step 2: Run the Database SQL

#### 2a. Create Tables
1. In your Supabase project, click **"SQL Editor"** in the left sidebar
2. Click **"New query"**
3. Open `sql/01_schema.sql` from this folder
4. **Copy the entire file** and paste it into the SQL editor
5. Click the green **"Run"** button
6. You should see "Success. No rows returned" — that means it worked!

#### 2b. Set Up Security Rules (RLS)
1. Click **"New query"** again
2. Open `sql/02_rls_policies.sql`
3. Copy, paste, and run it the same way

**What did we just do?**
- Created 4 tables: `departments`, `employees`, `admin_users`, `complaints`
- Added default departments (HR, Finance, etc.)
- Set up triggers so profiles auto-create on signup
- Added RLS so employees only see THEIR complaints

---

### Step 3: Get Your API Keys
1. In Supabase, click **"Project Settings"** (gear icon, bottom left)
2. Click **"API"** in the settings menu
3. You'll see two important values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

---

### Step 4: Connect the Frontend
1. Open `index.html` in a text editor (Notepad, VS Code, etc.)
2. Find these two lines near the top of the `<script>` section:
   ```javascript
   const SUPABASE_URL  = 'YOUR_SUPABASE_URL';
   const SUPABASE_ANON = 'YOUR_ANON_KEY';
   ```
3. Replace `YOUR_SUPABASE_URL` with your Project URL
4. Replace `YOUR_ANON_KEY` with your anon public key
5. **Save the file**

---

### Step 5: Run the App
- **Option A (Simple):** Double-click `index.html` — it opens in your browser!
- **Option B (Better, avoids CORS issues):** Use VS Code with the "Live Server" extension, then click "Go Live"
- **Option C (Best for production):** Deploy to [Netlify](https://netlify.com) — drag and drop the `index.html` file

---

### Step 6: Create Your First Admin Account
1. Open the app in browser
2. Select **"Admin"** role
3. Click **"Sign Up"** tab
4. Create your admin account
5. ⚠️ **Important:** Go to Supabase → Authentication → Users and confirm the email, OR disable email confirmation in Authentication → Settings → "Enable email confirmations" (turn it OFF for testing)

---

## 🗄️ Database Explained (Simple Version)

### Think of it like spreadsheets that talk to each other:

| Table | What it stores | Like a spreadsheet of... |
|-------|---------------|--------------------------|
| `departments` | HR, Finance, IT, etc. | Company org chart |
| `employees` | Employee profiles | Staff directory |
| `admin_users` | Admin accounts | Manager list |
| `complaints` | All complaints/feedback | Ticket system |

### How they connect:
```
employees ──submits──► complaints ──assigned to──► departments
              ↑                          ↑
         admin_users ──manages──────────┘
```

---

## 🔐 Security (RLS) Explained Simply

RLS = Row Level Security. Think of it like **folder permissions** on your computer.

| Who | What they can do |
|-----|-----------------|
| Not logged in | See nothing at all |
| Employee | Submit complaints, see ONLY their own, edit if Pending |
| Admin | See ALL complaints, update status, add notes, assign departments |

**The magic line that makes this work:**
```sql
USING (employee_id = auth.uid())
```
`auth.uid()` = "the ID of whoever is currently logged in"
So each employee only ever sees rows where `employee_id` matches their own ID.

---

## ⚡ Realtime Explained

When Admin changes a complaint status → Employee sees it **instantly**.

**How it works:**
```
Admin updates complaint
       ↓
Supabase detects the change
       ↓
Sends a "message" to all connected browsers
       ↓
JavaScript receives it and re-renders the page
```

This is powered by **WebSockets** — a permanent connection between browser and server.

---

## 🎯 Features Checklist

### ✅ Implemented
- [x] Employee signup/login
- [x] Admin signup/login
- [x] Role separation (employee vs admin)
- [x] Submit complaints with type (Complaint/Feedback/Suggestion)
- [x] Anonymous submission option
- [x] Assign to department
- [x] View own complaints (employee)
- [x] Edit complaints while Pending
- [x] Delete complaints while Pending
- [x] Admin dashboard with stats
- [x] Admin view all complaints
- [x] Filter by status, department, type
- [x] Update complaint status
- [x] Admin notes visible to employee
- [x] Realtime updates
- [x] Input validation
- [x] Toast notifications
- [x] Responsive design

---

## 💡 Optional Bonus Features (Level Up!)

### 1. Email Notifications
When a complaint is resolved, auto-send email to employee.
Use Supabase Edge Functions + Resend.com API.

### 2. File Attachments
Let employees attach screenshots to complaints.
Use Supabase Storage (built-in file hosting).

### 3. Priority Levels
Add a `priority` column: Low / Medium / High / Critical.
Show red badges for critical issues.

### 4. Analytics Charts
Show a pie chart of complaint types on admin dashboard.
Use Chart.js (free, easy to add).

### 5. Department Heads
Allow department managers to view only their department's complaints.
Add a `department_manager` role with scoped RLS.

### 6. Comment Thread
Allow back-and-forth between employee and admin on a complaint.
Create a `comments` table linked to `complaints`.

### 7. Export to CSV
Let admins download complaints as a spreadsheet.
Use the `json2csv` library.

---

## 🐛 Common Issues & Fixes

| Problem | Fix |
|---------|-----|
| "Invalid API key" error | Check you replaced BOTH `YOUR_SUPABASE_URL` and `YOUR_ANON_KEY` |
| Login works but can't see complaints | Run the RLS SQL again — it might not have worked |
| New user profile not created | Check the `handle_new_user` trigger ran successfully |
| "Email not confirmed" error | Disable email confirmation in Supabase Auth settings |
| Realtime not working | Check "Realtime" is enabled in Supabase → Database → Replication |

---

## 📚 Key Concepts You Learned

1. **Supabase** = Firebase alternative. Gives you database + auth + realtime for free.
2. **RLS** = Database-level security rules. Safer than checking permissions in JavaScript.
3. **JWT Auth** = When you login, Supabase gives you a "token" (like a key). Every database request includes this key.
4. **Realtime** = WebSocket connection that pushes changes to browser instantly.
5. **Triggers** = Database functions that run automatically when data changes.
6. **Modular JS** = Splitting code into small functions, each doing one job.
