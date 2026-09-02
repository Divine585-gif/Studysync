/**
 * StudySync API Server
 * Pure Node.js (no external deps) — JSON file database
 * Stores users + all their tasks, classes, notes, progress
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3847;
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const JWT_SECRET = process.env.JWT_SECRET || 'studysync-secret-change-in-production-2026';
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours — re-login required after this

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    const empty = { users: {}, data: {} };
    fs.writeFileSync(DB_FILE, JSON.stringify(empty, null, 2));
    return empty;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, data: {} };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function createToken(userId, email) {
  const payload = {
    sub: userId,
    email,
    exp: Date.now() + TOKEN_TTL_MS,
    iat: Date.now()
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(body).digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (Date.now() > payload.exp) return null; // expired
    return payload;
  } catch {
    return null;
  }
}

function uid() {
  return crypto.randomBytes(12).toString('hex');
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 2e6) {
        req.destroy();
        reject(new Error('Body too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function getAuth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  return verifyToken(token);
}

function ensureUserData(db, userId) {
  if (!db.data[userId]) {
    db.data[userId] = {
      tasks: [],
      classes: [],
      notes: [],
      profile: { school: '', level: '' }
    };
  }
  return db.data[userId];
}

// Static file serving for frontend
const PUBLIC = path.join(__dirname, '..');
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, { error: 'Forbidden' });
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(res, 404, { error: 'Not found' });
    return;
  }
  const ext = path.extname(filePath);
  const type = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    // ---------- AUTH ----------
    if (pathname === '/api/register' && req.method === 'POST') {
      const body = await readBody(req);
      const name = (body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      if (!name || !email || password.length < 6) {
        return send(res, 400, { error: 'Name, email, and password (min 6 chars) required' });
      }

      const db = loadDb();
      if (Object.values(db.users).some(u => u.email === email)) {
        return send(res, 409, { error: 'An account with this email already exists' });
      }

      const id = uid();
      const salt = crypto.randomBytes(16).toString('hex');
      db.users[id] = {
        id,
        name,
        email,
        salt,
        passwordHash: hashPassword(password, salt),
        createdAt: new Date().toISOString()
      };
      ensureUserData(db, id);
      saveDb(db);

      // Do NOT return a token — user must log in
      return send(res, 201, {
        success: true,
        message: 'Account created successfully. Please sign in with your credentials.'
      });
    }

    if (pathname === '/api/login' && req.method === 'POST') {
      const body = await readBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';

      const db = loadDb();
      const user = Object.values(db.users).find(u => u.email === email);
      if (!user || user.passwordHash !== hashPassword(password, user.salt)) {
        return send(res, 401, { error: 'Invalid email or password' });
      }

      const token = createToken(user.id, user.email);
      const udata = ensureUserData(db, user.id);
      return send(res, 200, {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          school: udata.profile.school || '',
          level: udata.profile.level || ''
        },
        expiresIn: TOKEN_TTL_MS
      });
    }

    if (pathname === '/api/me' && req.method === 'GET') {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: 'Session expired. Please sign in again.' });
      const db = loadDb();
      const user = db.users[auth.sub];
      if (!user) return send(res, 401, { error: 'User not found' });
      const udata = ensureUserData(db, user.id);
      return send(res, 200, {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          school: udata.profile.school || '',
          level: udata.profile.level || ''
        }
      });
    }

    // ---------- USER DATA (protected) ----------
    if (pathname === '/api/data' && req.method === 'GET') {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: 'Session expired. Please sign in again.' });
      const db = loadDb();
      const udata = ensureUserData(db, auth.sub);
      return send(res, 200, udata);
    }

    if (pathname === '/api/data' && req.method === 'PUT') {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: 'Session expired. Please sign in again.' });
      const body = await readBody(req);
      const db = loadDb();
      const current = ensureUserData(db, auth.sub);
      if (Array.isArray(body.tasks)) current.tasks = body.tasks;
      if (Array.isArray(body.classes)) current.classes = body.classes;
      if (Array.isArray(body.notes)) current.notes = body.notes;
      if (body.profile && typeof body.profile === 'object') {
        current.profile = {
          school: body.profile.school || '',
          level: body.profile.level || ''
        };
      }
      // optional name update
      if (body.name && typeof body.name === 'string') {
        if (db.users[auth.sub]) db.users[auth.sub].name = body.name.trim();
      }
      saveDb(db);
      return send(res, 200, { success: true });
    }

    if (pathname === '/api/profile' && req.method === 'PUT') {
      const auth = getAuth(req);
      if (!auth) return send(res, 401, { error: 'Session expired. Please sign in again.' });
      const body = await readBody(req);
      const db = loadDb();
      if (db.users[auth.sub] && body.name) {
        db.users[auth.sub].name = String(body.name).trim();
      }
      const udata = ensureUserData(db, auth.sub);
      if (body.school !== undefined) udata.profile.school = String(body.school).trim();
      if (body.level !== undefined) udata.profile.level = String(body.level).trim();
      saveDb(db);
      return send(res, 200, {
        success: true,
        user: {
          id: auth.sub,
          name: db.users[auth.sub].name,
          email: db.users[auth.sub].email,
          school: udata.profile.school,
          level: udata.profile.level
        }
      });
    }

    // Health
    if (pathname === '/api/health') {
      return send(res, 200, { ok: true, app: 'StudySync' });
    }

    // Static files
    if (!pathname.startsWith('/api')) {
      return serveStatic(req, res, pathname);
    }

    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message || 'Server error' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  StudySync server running at http://localhost:${PORT}\n`);
  console.log(`  Open that URL in your browser.\n`);
  console.log(`  Session expires after 12 hours — users must log in again.\n`);
});
