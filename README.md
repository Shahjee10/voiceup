# VoiceUp – Employee Complaint & Feedback Management System

**VoiceUp** is a modern **web application** designed to allow employees to submit complaints, feedback, or suggestions, while enabling administrators to manage, track, and resolve them efficiently. Built using **Supabase**, **HTML**, **CSS**, and **JavaScript**, this system provides a **secure, responsive, and professional SaaS-style dashboard** experience.

---

## 🔹 Features

### **Authentication & Account Handling**
- **Role-based login:** Employees or Admins, validated against respective tables.  
- **Sign up:** Collects full name, email, password; stores metadata with role.  
- **Password reset:** Multi-step OTP-based flow with email verification.  
- **Session management:** Auto-login on existing session and real-time auth state handling.  
- **Logout:** Secure sign-out returning users to the authentication screen.

### **Employee Experience**
- **Dashboard:** View complaint statistics and recent activity.  
- **My Complaints:** List, edit, and delete own complaints; filter by status or department.  
- **Submit Feedback:** Create complaints, feedback, or suggestions; support for **anonymous submissions**.  
- **File attachments:** Upload evidence supporting complaints.  
- **Realtime updates:** Auto-refresh complaint list and status via Supabase subscriptions.

### **Admin Experience**
- **Dashboard:** High-level metrics, charts, and recent complaints activity.  
- **All Complaints:** Global view with advanced filtering by **status, type, department**, and search.  
- **Complaint Management:** Update complaint status, assign admins, add notes, and view employee info or anonymity.  
- **Discussion Threads:** Comment system for internal communication on complaints.  
- **Realtime updates:** Dashboard statistics and complaint lists update instantly.

### **UI/UX & Design**
- Modern **SaaS-style layout** with sidebar navigation and card-based dashboard.  
- **Responsive design** for desktop and mobile.  
- **Status badges & priority indicators** for easy tracking.  
- **Toast notifications, loading states, and empty states** for smooth user experience.  

---

## 🔹 Tech Stack
- **Frontend:** HTML, CSS, JavaScript  
- **Backend & Auth:** Supabase (PostgreSQL + Realtime + Authentication)  
- **Storage:** Supabase Storage (for attachments)  

---

## 🔹 Setup & Installation

1. **Clone the repository:**
```bash
git clone https://github.com/Shahjee10/voiceup.git
cd voiceup
