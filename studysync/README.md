# StudySync — Student Task Manager

Frontend connected to your collaborator's backend API.

## API connection

Edit **`js/config.js`**:

```js
window.STUDYSYNC_API = 'http://localhost:3000';
```

When the backend is deployed online, change it to that URL, e.g.:

```js
window.STUDYSYNC_API = 'https://your-api.onrender.com';
```

## How auth works

1. **Register** → `POST /api/auth/register`  
   Body: `{ firstName, lastName, email, password, role: "student" }`  
   App shows success popup → user must **sign in** (no auto-login).

2. **Login** → `POST /api/login`  
   Saves `token` in `localStorage`.

3. **Protected requests** send:
   ```
   Authorization: Bearer <token>
   Content-Type: application/json
   ```

4. **Logout** clears `localStorage`.

## Features mapped to API

| UI | API |
|----|-----|
| Tasks | GET/POST/PUT/DELETE `/api/tasks` |
| Projects | GET/POST/PUT/DELETE `/api/projects` |
| Notes | GET/POST/PUT/DELETE `/api/notes` |
| Profile | GET `/api/users/profile` |
| Timetable | GET `/api/timetable` |
| Notifications | GET `/api/notifications` |
| Study timer | Local only (browser) |

## Run locally

1. Start the **backend** (port 3000) from your collaborator.
2. Serve this frontend, e.g.:
   ```bash
   npx serve .
   ```
   or open via any static host / Render.
3. Open the frontend URL in the browser.

**Important:** Do not open `index.html` as a file (`file://`). Use http:// so API calls work.

## CORS

If the frontend and API are on different origins, the backend must allow CORS from your frontend domain (e.g. `Access-Control-Allow-Origin`).

## Deploy frontend (Render / Netlify / Vercel)

This folder is static + optional old server. For production:

1. Set `js/config.js` to the **public API URL** (not localhost).
2. Deploy the frontend as a static site, **or** keep using `node server/server.js` only if you still need it (not required when using the collaborator API).

Data now lives in the collaborator's database — redeploying the frontend will **not** wipe users.
