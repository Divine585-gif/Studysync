# StudySync — Student Task Manager

Organize assignments, class timetable, notes, deadlines and study sessions.
Data is stored on the server so you can log in from any device.

---

## Deploy on Render (for everyone to use)

### 1. Put the code on GitHub
1. Create a free account at [github.com](https://github.com)
2. Create a **new repository** (e.g. `studysync`)
3. Upload this whole folder to that repo  
   (or use GitHub Desktop / `git push`)

### 2. Create a Web Service on Render
1. Go to [render.com](https://render.com) → sign up (free)
2. **Dashboard** → **New +** → **Web Service**
3. Connect your GitHub account and select the `studysync` repo
4. Fill in:

| Field | Value |
|--------|--------|
| **Name** | `studysync` (or any name) |
| **Region** | Closest to you |
| **Runtime** | Node |
| **Build Command** | `echo ok` (or leave blank) |
| **Start Command** | `node server/server.js` |
| **Instance Type** | **Free** |

5. Click **Advanced** → **Add Environment Variable**:
   - Key: `JWT_SECRET`  
   - Value: any long random string (e.g. `my-class-secret-2026-xyz`)

6. Click **Create Web Service**

### 3. Wait for deploy
Render will build and start the app. When status is **Live**, open the URL shown  
(e.g. `https://studysync-xxxx.onrender.com`).

Share that link with anyone. They do **not** need Node.js.

### Notes about the free plan
- The app may **sleep** after ~15 minutes of no traffic. The first visit after sleep can take 30–60 seconds.
- Data is stored in a file on the server. On the free plan, a **full redeploy** can reset data. For a school project this is usually fine. For permanent storage later, use a paid disk or a cloud database (Supabase, etc.).

---

## Run on your computer (optional)

```bash
node server/server.js
```

Then open **http://localhost:3847**

---

## Features
- Register → success message → must sign in (no auto-login)
- Logout + session expires after 12 hours
- Tasks & projects, timetable, calendar, notes, study timer, progress
- Browser notifications for deadlines and milestones
