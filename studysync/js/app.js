/* StudySync frontend — connected to collaborator API */
const API_BASE = window.STUDYSYNC_API || 'http://localhost:3000';
const TOKEN_KEY = 'token';
const USER_KEY = 'studysync_user';

let state = {
  user: null,
  tasks: [],
  projects: [],
  classes: [],
  notes: [],
  notifications: []
};
let token = localStorage.getItem(TOKEN_KEY) || null;

/** Pull array from many common API response shapes */
function extractList(data, preferredKeys) {
  preferredKeys = preferredKeys || ['data', 'results', 'items', 'rows'];
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of preferredKeys) {
    if (Array.isArray(data[k])) return data[k];
  }
  if (data.data && typeof data.data === 'object') {
    if (Array.isArray(data.data)) return data.data;
    for (const k of preferredKeys) {
      if (Array.isArray(data.data[k])) return data.data[k];
    }
  }
  // single nested resource name
  for (const k of Object.keys(data)) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}

function pickField(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim() !== '') return obj[k];
  }
  const map = {};
  Object.keys(obj).forEach(k => { map[k.toLowerCase().replace(/[_\s-]/g, '')] = obj[k]; });
  for (const k of keys) {
    const nk = k.toLowerCase().replace(/[_\s-]/g, '');
    if (map[nk] != null && String(map[nk]).trim() !== '') return map[nk];
  }
  return null;
}

function normalizeUser(u) {
  if (!u) return null;
  const firstName = pickField(u, ['firstName', 'first_name', 'firstname', 'fname']) ||
    (pickField(u, ['name', 'fullName', 'full_name']) ? String(pickField(u, ['name', 'fullName', 'full_name'])).split(/\s+/)[0] : '') ||
    (pickField(u, ['email']) ? String(pickField(u, ['email'])).split('@')[0] : '') ||
    '';
  const lastName = pickField(u, ['lastName', 'last_name', 'lastname', 'lname']) ||
    (pickField(u, ['name', 'fullName', 'full_name']) ? String(pickField(u, ['name', 'fullName', 'full_name'])).split(/\s+/).slice(1).join(' ') : '') ||
    '';
  const name = [firstName, lastName].filter(Boolean).join(' ') ||
    pickField(u, ['name', 'fullName', 'full_name', 'username']) ||
    pickField(u, ['email']) ||
    'Student';
  return {
    id: u.id ?? u._id ?? u.userId,
    name,
    firstName: firstName || String(name).split(/\s+/)[0] || 'Student',
    lastName,
    email: pickField(u, ['email']) || '',
    school: pickField(u, ['school', 'university', 'institution']) || '',
    level: pickField(u, ['level', 'year', 'classLevel']) || '',
    role: pickField(u, ['role']) || 'student'
  };
}

function updateUserChip() {
  const el = document.getElementById('user-chip');
  if (!el) return;
  const label = (state.user?.firstName || state.user?.name || 'Student').toString().trim().split(/\s+/)[0];
  el.textContent = label || 'Student';
}



async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(options.headers || {})
  };
  if (token) headers.Authorization = 'Bearer ' + token;

  let res;
  try {
    res = await fetch(API_BASE + path, { ...options, headers });
  } catch (err) {
    console.error('Network error calling', API_BASE + path, err);
    throw new Error(
      'Network/CORS error talking to ' + API_BASE + path +
      '.\n\nIf login worked but tasks fail, the API must allow Authorization header in CORS ' +
      '(Access-Control-Allow-Headers: Content-Type, Authorization) and handle OPTIONS preflight.'
    );
  }

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    forceLogout('Your session has expired. Please sign in again.');
    throw new Error(data.message || data.error || 'Unauthorized');
  }
  if (!res.ok) {
    console.error('API error', res.status, path, data);
    throw new Error(data.message || data.error || ('Request failed (' + res.status + ' on ' + path + ')'));
  }
  return data;
}

function forceLogout(msg) {
  token = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  state.user = null;
  const app = document.getElementById('app');
  const auth = document.getElementById('auth-container');
  if (app) { app.classList.add('hidden'); app.style.display = 'none'; }
  if (auth) { auth.classList.remove('hidden'); auth.style.display = 'flex'; }
  showAuthView('login-view');
  if (msg) setTimeout(() => alert(msg), 50);
}

/* ---------- Auth UI ---------- */
function showAuthView(id) {
  document.querySelectorAll('.auth-card').forEach(c => c.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

document.getElementById('show-signup')?.addEventListener('click', e => {
  e.preventDefault();
  showAuthView('signup-view');
});
document.getElementById('show-login')?.addEventListener('click', e => {
  e.preventDefault();
  showAuthView('login-view');
});
document.getElementById('show-forgot')?.addEventListener('click', e => {
  e.preventDefault();
  showAuthView('forgot-view');
});
document.getElementById('back-to-login')?.addEventListener('click', e => {
  e.preventDefault();
  showAuthView('login-view');
});
document.querySelectorAll('.toggle-pass').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });
});

/* Register — NO auto-login */
document.getElementById('signup-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const fullName = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const parts = fullName.split(/\s+/);
  const firstName = parts[0] || fullName;
  const lastName = parts.slice(1).join(' ') || firstName;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        firstName,
        lastName,
        email,
        password,
        role: 'student'
      })
    });
    showSuccessModal(
      'Account created successfully!',
      'You can now sign in with your email and password.',
      () => {
        document.getElementById('signup-form').reset();
        showAuthView('login-view');
        document.getElementById('login-email').value = email;
      }
    );
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register';
  }
});

/* Login */
document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    token = data.token || data.accessToken || data.access_token;
    if (!token) throw new Error('Login succeeded but no token was returned');
    localStorage.setItem(TOKEN_KEY, token);
    if (data.user) {
      state.user = normalizeUser(data.user);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    }
    await loadProfile();
    await loadAllData();
    enterApp();
    requestNotificationPermission();
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

document.getElementById('forgot-form')?.addEventListener('submit', e => {
  e.preventDefault();
  alert('Password reset is not available yet. Contact support or create a new account.');
  showAuthView('login-view');
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Log out of StudySync?')) forceLogout(null);
});
document.getElementById('logout-btn-mobile')?.addEventListener('click', () => {
  closeDrawer();
  if (confirm('Log out of StudySync?')) forceLogout(null);
});

async function loadProfile() {
  try {
    const data = await api('/api/users/profile');
    const u = data.user || data.data || data;
    state.user = normalizeUser(u);
    if (state.user) localStorage.setItem(USER_KEY, JSON.stringify(state.user));
  } catch (e) {
    console.warn('profile', e);
    const cached = localStorage.getItem(USER_KEY);
    if (cached) {
      try { state.user = normalizeUser(JSON.parse(cached)); } catch (_) {}
    }
  }
}

async function loadAllData() {
  // Load each resource independently so one missing route does not break the whole app
  const results = await Promise.allSettled([
    loadTasks(),
    loadProjects(),
    loadNotes(),
    loadTimetable(),
    loadNotifications()
  ]);
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn('Data load failed [' + i + ']:', r.reason?.message || r.reason);
    }
  });
}

function enterApp() {
  const auth = document.getElementById('auth-container');
  const app = document.getElementById('app');
  auth.classList.add('hidden');
  auth.style.display = 'none';
  app.classList.remove('hidden');
  app.style.display = 'flex';
  updateUserChip();
  renderAll();
  showView('dashboard');
  scheduleDeadlineChecks();
}

function showSuccessModal(title, message, onClose) {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  body.innerHTML =
    '<div style="text-align:center;padding:8px 0">' +
    '<div style="font-size:2.5rem;margin-bottom:12px">✓</div>' +
    '<h3 style="margin-bottom:8px">' + escapeHtml(title) + '</h3>' +
    '<p style="color:var(--text-muted);margin-bottom:20px;font-size:0.95rem">' +
    escapeHtml(message) + '</p>' +
    '<button type="button" class="btn-primary" id="success-ok" style="margin-top:0">Continue to Sign In</button></div>';
  overlay.classList.remove('hidden');
  document.getElementById('success-ok').onclick = () => {
    closeModal();
    if (onClose) onClose();
  };
}

/* ---------- Navigation ---------- */
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById('view-' + name);
  if (viewEl) viewEl.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name)
  );
  document.querySelectorAll('.mobile-nav-btn').forEach(b => {
    if (b.dataset.view === 'more') return;
    b.classList.toggle('active', b.dataset.view === name);
  });
  const titles = {
    dashboard: 'Dashboard',
    tasks: 'Tasks & Projects',
    calendar: 'Calendar',
    timetable: 'Class Timetable',
    notes: 'Notes',
    timer: 'Study Timer',
    progress: 'Progress',
    notifications: 'Notifications',
    profile: 'Profile'
  };
  document.getElementById('page-title').textContent = titles[name] || name;
  closeDrawer();
}

function openDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  if (overlay) overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDrawer() {
  const drawer = document.getElementById('mobile-drawer');
  const overlay = document.getElementById('drawer-overlay');
  if (!drawer) return;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (overlay) overlay.classList.add('hidden');
  document.body.style.overflow = '';
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  if (!btn.closest('#mobile-drawer')) {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  }
});
document.querySelectorAll('.qa-btn').forEach(btn =>
  btn.addEventListener('click', () => showView(btn.dataset.view))
);
document.querySelectorAll('.mobile-nav-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'more') return;
    showView(btn.dataset.view);
  })
);
document.getElementById('menu-btn')?.addEventListener('click', openDrawer);
document.getElementById('drawer-close')?.addEventListener('click', closeDrawer);
document.getElementById('drawer-overlay')?.addEventListener('click', closeDrawer);
document.querySelectorAll('#mobile-drawer .nav-btn').forEach(btn =>
  btn.addEventListener('click', () => showView(btn.dataset.view))
);

/* ---------- Helpers ---------- */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function normalizeDue(t) {
  return t.dueDate || t.due_date || t.due || t.deadline || null;
}
function isCompleted(t) {
  const s = (t.status || '').toLowerCase();
  return t.completed === true || s === 'completed' || s === 'done';
}
function isOverdue(t) {
  if (isCompleted(t)) return false;
  const due = normalizeDue(t);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(due.slice(0, 10)) < today;
}
function isDueToday(t) {
  if (isCompleted(t)) return false;
  const due = normalizeDue(t);
  if (!due) return false;
  return due.slice(0, 10) === new Date().toISOString().slice(0, 10);
}

/* ---------- Tasks ---------- */
async function loadTasks() {
  try {
    const data = await api('/api/tasks');
    const list = extractList(data, ['tasks', 'data', 'results', 'items']);
    state.tasks = list.map(normalizeTask);
    console.log('Loaded tasks:', state.tasks.length, state.tasks);
  } catch (e) {
    console.warn('tasks', e);
    state.tasks = [];
  }
}

function normalizeTask(t) {
  if (!t || typeof t !== 'object') return t;
  if (!window.__taskLogged) {
    console.log('Sample raw task from API:', t);
    console.log('Task keys:', Object.keys(t));
    window.__taskLogged = true;
  }
  const title =
    pickField(t, [
      'title', 'name', 'taskTitle', 'task_title', 'taskName', 'task_name',
      'subject', 'topic', 'task', 'label', 'heading'
    ]) ||
    (pickField(t, ['description', 'desc', 'details', 'body', 'content'])
      ? String(pickField(t, ['description', 'desc', 'details', 'body', 'content'])).slice(0, 80)
      : null) ||
    'Untitled task';
  const dueDate = pickField(t, [
    'dueDate', 'due_date', 'due', 'deadline', 'endDate', 'end_date', 'date'
  ]);
  const status = pickField(t, ['status', 'state']) || (t.completed ? 'completed' : 'pending');
  const priority = pickField(t, ['priority', 'Priority', 'importance']) || 'Medium';
  const description = pickField(t, ['description', 'desc', 'details', 'body', 'content', 'note']) || '';
  return {
    ...t,
    id: t.id ?? t._id ?? t.taskId ?? t.task_id,
    title: String(title),
    description: String(description),
    priority: String(priority),
    status: String(status),
    dueDate: dueDate ? String(dueDate).slice(0, 10) : null,
    completed:
      String(status).toLowerCase() === 'completed' ||
      String(status).toLowerCase() === 'done' ||
      t.completed === true ||
      t.completed === 1
  };
}

async function loadProjects() {
  try {
    const data = await api('/api/projects');
    const list = extractList(data, ['projects', 'data', 'results', 'items']);
    state.projects = list.map(p => ({
      ...p,
      id: p.id ?? p._id,
      title: p.title || p.name || 'Untitled project',
      dueDate: p.dueDate || p.due_date || p.due || null,
      startDate: p.startDate || p.start_date || null,
      status: p.status || 'pending',
      description: p.description || ''
    }));
    console.log('Loaded projects:', state.projects.length);
  } catch (e) {
    console.warn('projects', e);
    state.projects = [];
  }
}

function allWorkItems() {
  const tasks = state.tasks.map(t => ({
    ...t,
    _kind: 'task',
    title: t.title,
    due: normalizeDue(t),
    completed: isCompleted(t)
  }));
  const projects = state.projects.map(p => ({
    ...p,
    _kind: 'project',
    title: p.title,
    due: p.dueDate || p.due || null,
    completed: (p.status || '').toLowerCase() === 'completed',
    type: 'Project'
  }));
  return [...tasks, ...projects];
}

function renderTasks(filter) {
  filter = filter || 'all';
  const list = document.getElementById('tasks-list');
  if (!list) return;
  let items = allWorkItems().sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '9999') > (b.due || '9999') ? 1 : -1;
  });
  if (filter === 'pending') items = items.filter(t => !t.completed);
  if (filter === 'completed') items = items.filter(t => t.completed);
  if (filter === 'overdue') items = items.filter(t => isOverdue(t));

  if (!items.length) {
    list.innerHTML =
      '<div class="empty-state"><span>📭</span>No tasks yet. Add an assignment or project!</div>';
    return;
  }
  list.innerHTML = items
    .map(t => {
      const id = t.id;
      const kind = t._kind;
      return (
        '<div class="task-item ' +
        (t.completed ? 'completed' : '') +
        '" data-id="' +
        id +
        '" data-kind="' +
        kind +
        '">' +
        '<button class="task-check ' +
        (t.completed ? 'done' : '') +
        '" data-action="toggle">' +
        (t.completed ? '✓' : '') +
        '</button>' +
        '<div class="task-body"><div class="task-title">' +
        escapeHtml(t.title) +
        '</div><div class="task-meta">' +
        (t.due
          ? '<span class="due ' +
            (isOverdue(t) ? 'overdue' : '') +
            '">Due: ' +
            formatDate(t.due) +
            '</span>'
          : '') +
        (t.priority ? '<span class="tag">' + escapeHtml(t.priority) + '</span>' : '') +
        (t.type || kind === 'project'
          ? '<span class="tag">' + escapeHtml(t.type || 'Project') + '</span>'
          : '') +
        '</div></div>' +
        '<div class="task-actions">' +
        '<button data-action="edit">✏️</button>' +
        '<button data-action="delete">🗑️</button></div></div>'
      );
    })
    .join('');
}

function renderUpcoming() {
  const list = document.getElementById('upcoming-list');
  if (!list) return;
  const upcoming = allWorkItems()
    .filter(t => !t.completed && t.due)
    .sort((a, b) => (a.due > b.due ? 1 : -1))
    .slice(0, 5);
  if (!upcoming.length) {
    list.innerHTML =
      '<div class="empty-state" style="padding:20px"><span>🎉</span>No upcoming deadlines</div>';
    return;
  }
  list.innerHTML = upcoming
    .map(
      t =>
        '<div class="task-item"><div class="task-body"><div class="task-title">' +
        escapeHtml(t.title) +
        '</div><div class="task-meta"><span class="due ' +
        (isOverdue(t) ? 'overdue' : '') +
        '">' +
        formatDate(t.due) +
        '</span></div></div></div>'
    )
    .join('');
}

function updateStats() {
  const items = allWorkItems();
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  };
  set('stat-pending', items.filter(t => !t.completed).length);
  set('stat-completed', items.filter(t => t.completed).length);
  set('stat-today', items.filter(t => isDueToday(t)).length);
  set('stat-overdue', items.filter(t => isOverdue(t)).length);
  const total = items.length;
  const done = items.filter(t => t.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const bar = document.getElementById('completion-bar');
  if (bar) bar.style.width = pct + '%';
  set('completion-pct', pct + '%');
  set('total-tasks', total);
  set('week-completed', done);
}

document.getElementById('tasks-list')?.addEventListener('click', async e => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;
  const kind = item.dataset.kind;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'toggle') {
    try {
      if (kind === 'project') {
        const p = state.projects.find(x => String(x.id) === String(id));
        if (!p) return;
        const next = isCompleted(p) ? 'in-progress' : 'completed';
        await api('/api/projects/' + id, {
          method: 'PUT',
          body: JSON.stringify({ ...p, status: next })
        });
      } else {
        const t = state.tasks.find(x => String(x.id) === String(id));
        if (!t) return;
        const next = isCompleted(t) ? 'pending' : 'completed';
        await api('/api/tasks/' + id, {
          method: 'PUT',
          body: JSON.stringify({
            title: t.title,
            description: t.description || '',
            priority: t.priority || 'Medium',
            status: next,
            dueDate: normalizeDue(t) || null
          })
        });
      }
      await loadTasks();
      await loadProjects();
      renderAll();
      maybeNotifyProgress();
    } catch (err) {
      alert(err.message);
    }
  }

  if (action === 'delete' && confirm('Delete this item?')) {
    try {
      if (kind === 'project') await api('/api/projects/' + id, { method: 'DELETE' });
      else await api('/api/tasks/' + id, { method: 'DELETE' });
      await loadTasks();
      await loadProjects();
      renderAll();
    } catch (err) {
      alert(err.message);
    }
  }

  if (action === 'edit') {
    if (kind === 'project') {
      openProjectModal(state.projects.find(x => String(x.id) === String(id)));
    } else {
      openTaskModal(state.tasks.find(x => String(x.id) === String(id)));
    }
  }
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks(btn.dataset.filter);
  });
});

/* ---------- Modal ---------- */
const overlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
document.getElementById('modal-close')?.addEventListener('click', closeModal);
overlay?.addEventListener('click', e => {
  if (e.target === overlay) closeModal();
});
function closeModal() {
  overlay.classList.add('hidden');
  modalBody.innerHTML = '';
}

function openTaskModal(task) {
  const isEdit = !!task;
  modalBody.innerHTML =
    '<h3>' +
    (isEdit ? 'Edit Task' : 'Add Task') +
    '</h3><form id="task-form">' +
    '<label>Title*</label><input type="text" id="task-title" value="' +
    (task ? escapeHtml(task.title) : '') +
    '" required placeholder="e.g. CSC 301 Assignment 2" />' +
    '<label>Description</label><textarea id="task-desc">' +
    (task ? escapeHtml(task.description || '') : '') +
    '</textarea>' +
    '<div class="form-row"><div><label>Due Date</label><input type="date" id="task-due" value="' +
    (task ? (normalizeDue(task) || '').slice(0, 10) : '') +
    '" /></div>' +
    '<div><label>Priority</label><select id="task-priority">' +
    '<option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>' +
    '</select></div></div>' +
    '<label>Status</label><select id="task-status">' +
    '<option value="pending">Pending</option><option value="in-progress">In Progress</option>' +
    '<option value="completed">Completed</option></select>' +
    '<button type="submit" class="btn-primary">' +
    (isEdit ? 'Update' : 'Create') +
    '</button></form>';

  if (task) {
    document.getElementById('task-priority').value = task.priority || 'Medium';
    document.getElementById('task-status').value = (task.status || 'pending').toLowerCase();
  }
  overlay.classList.remove('hidden');

  document.getElementById('task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      title: document.getElementById('task-title').value.trim(),
      description: document.getElementById('task-desc').value.trim(),
      dueDate: document.getElementById('task-due').value || null,
      priority: document.getElementById('task-priority').value,
      status: document.getElementById('task-status').value
    };
    try {
      if (isEdit) {
        await api('/api/tasks/' + task.id, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadTasks();
      closeModal();
      renderAll();
    } catch (err) {
      alert(err.message);
    }
  });
}

function openProjectModal(project) {
  const isEdit = !!project;
  modalBody.innerHTML =
    '<h3>' +
    (isEdit ? 'Edit Project' : 'Add Project') +
    '</h3><form id="project-form">' +
    '<label>Title*</label><input type="text" id="proj-title" value="' +
    (project ? escapeHtml(project.title) : '') +
    '" required />' +
    '<label>Description</label><textarea id="proj-desc">' +
    (project ? escapeHtml(project.description || '') : '') +
    '</textarea>' +
    '<div class="form-row"><div><label>Start Date</label><input type="date" id="proj-start" value="' +
    (project?.startDate || '').toString().slice(0, 10) +
    '" /></div>' +
    '<div><label>Due Date</label><input type="date" id="proj-due" value="' +
    (project?.dueDate || '').toString().slice(0, 10) +
    '" /></div></div>' +
    '<label>Status</label><select id="proj-status">' +
    '<option value="pending">Pending</option><option value="in-progress">In Progress</option>' +
    '<option value="completed">Completed</option></select>' +
    '<button type="submit" class="btn-primary">' +
    (isEdit ? 'Update' : 'Create') +
    '</button></form>';
  if (project) {
    document.getElementById('proj-status').value = (project.status || 'pending').toLowerCase();
  }
  overlay.classList.remove('hidden');
  document.getElementById('project-form').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      title: document.getElementById('proj-title').value.trim(),
      description: document.getElementById('proj-desc').value.trim(),
      startDate: document.getElementById('proj-start').value || null,
      dueDate: document.getElementById('proj-due').value || null,
      status: document.getElementById('proj-status').value
    };
    try {
      if (isEdit) {
        await api('/api/projects/' + project.id, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/projects', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadProjects();
      closeModal();
      renderAll();
    } catch (err) {
      alert(err.message);
    }
  });
}

document.getElementById('add-task-btn')?.addEventListener('click', () => {
  modalBody.innerHTML =
    '<h3>What do you want to add?</h3>' +
    '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' +
    '<button type="button" class="btn-primary" id="pick-task" style="margin:0">Task / Assignment</button>' +
    '<button type="button" class="btn-secondary" id="pick-project">Project</button></div>';
  overlay.classList.remove('hidden');
  document.getElementById('pick-task').onclick = () => openTaskModal(null);
  document.getElementById('pick-project').onclick = () => openProjectModal(null);
});

/* ---------- Calendar ---------- */
let calDate = new Date();
let selectedDay = null;

function renderCalendar() {
  const year = calDate.getFullYear();
  const month = calDate.getMonth();
  const title = document.getElementById('cal-month-year');
  if (title)
    title.textContent = calDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dayNames.map(d => '<div class="cal-day-name">' + d + '</div>').join('');
  for (let i = firstDay - 1; i >= 0; i--)
    html += '<div class="cal-day other-month">' + (daysInPrev - i) + '</div>';
  const todayStr = new Date().toISOString().slice(0, 10);
  const items = allWorkItems();
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr =
      year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const has = items.some(t => t.due && t.due.slice(0, 10) === dateStr);
    html +=
      '<div class="cal-day ' +
      (dateStr === todayStr ? 'today' : '') +
      ' ' +
      (selectedDay === dateStr ? 'selected' : '') +
      '" data-date="' +
      dateStr +
      '">' +
      d +
      (has ? '<span class="dot"></span>' : '') +
      '</div>';
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++)
    html += '<div class="cal-day other-month">' + i + '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      selectedDay = el.dataset.date;
      renderCalendar();
      renderDayTasks(selectedDay);
    });
  });
}

function renderDayTasks(dateStr) {
  const list = document.getElementById('day-tasks');
  if (!list) return;
  const tasks = allWorkItems().filter(t => t.due && t.due.slice(0, 10) === dateStr);
  if (!tasks.length) {
    list.innerHTML =
      '<div class="empty-state" style="padding:16px">No tasks on this day</div>';
    return;
  }
  list.innerHTML = tasks
    .map(
      t =>
        '<div class="task-item ' +
        (t.completed ? 'completed' : '') +
        '"><div class="task-body"><div class="task-title">' +
        escapeHtml(t.title) +
        '</div></div></div>'
    )
    .join('');
}

document.getElementById('prev-month')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById('next-month')?.addEventListener('click', () => {
  calDate.setMonth(calDate.getMonth() + 1);
  renderCalendar();
});

/* ---------- Timetable ---------- */
async function loadTimetable() {
  try {
    const data = await api('/api/timetable');
    state.classes = Array.isArray(data) ? data : data.timetable || data.classes || [];
  } catch (e) {
    console.warn('timetable', e);
    state.classes = [];
  }
}

function renderTimetable() {
  const list = document.getElementById('timetable-list');
  if (!list) return;
  if (!state.classes.length) {
    list.innerHTML =
      '<div class="empty-state"><span>📚</span>No classes in timetable yet.<br><small style="opacity:0.7">Data comes from the API (GET /api/timetable)</small></div>';
    return;
  }
  list.innerHTML = state.classes
    .map(c => {
      const course = c.course || c.courseName || c.title || 'Class';
      const day = c.day || c.dayOfWeek || '';
      const start = c.start || c.startTime || '--:--';
      const end = c.end || c.endTime || '--:--';
      const venue = c.venue || c.location || '';
      return (
        '<div class="class-item"><div class="class-info"><strong>' +
        escapeHtml(course) +
        '</strong><span>' +
        start +
        ' – ' +
        end +
        (venue ? ' • ' + escapeHtml(venue) : '') +
        '</span></div>' +
        (day ? '<span class="class-day">' + escapeHtml(day) + '</span>' : '') +
        '</div>'
      );
    })
    .join('');
}

document.getElementById('add-class-btn')?.addEventListener('click', () => {
  alert(
    'Timetable entries are managed by the backend API.\n\nAsk your collaborator to add POST /api/timetable if you need to create classes from the app.'
  );
});

/* ---------- Notes ---------- */
async function loadNotes() {
  try {
    const data = await api('/api/notes');
    const list = extractList(data, ['notes', 'data', 'results', 'items']);
    state.notes = list.map(n => {
      if (!window.__noteLogged) {
        console.log('Sample raw note from API:', n);
        console.log('Note keys:', Object.keys(n));
        window.__noteLogged = true;
      }
      return {
        ...n,
        id: n.id ?? n._id ?? n.noteId,
        title: pickField(n, ['title', 'name', 'noteTitle', 'note_title', 'heading', 'subject']) || 'Untitled',
        content: pickField(n, ['content', 'body', 'text', 'note', 'description', 'details']) || '',
        updatedAt: pickField(n, ['updatedAt', 'updated_at', 'createdAt', 'created_at'])
      };
    });
  } catch (e) {
    console.warn('notes', e);
    state.notes = [];
  }
}

function renderNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  if (!state.notes.length) {
    list.innerHTML = '<div class="empty-state"><span>📝</span>No notes yet</div>';
    return;
  }
  list.innerHTML = state.notes
    .map(n => {
      const updated = (n.updatedAt || n.createdAt || '').toString().slice(0, 10);
      return (
        '<div class="note-card" data-id="' +
        n.id +
        '"><h4>' +
        escapeHtml(n.title || 'Untitled') +
        '</h4><p>' +
        escapeHtml(n.content || n.body || '') +
        '</p>' +
        (updated ? '<div class="note-date">' + formatDate(updated) + '</div>' : '') +
        '</div>'
      );
    })
    .join('');
  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () =>
      openNoteModal(state.notes.find(n => String(n.id) === String(card.dataset.id)))
    );
  });
}

function openNoteModal(note) {
  const isEdit = !!note;
  modalBody.innerHTML =
    '<h3>' +
    (isEdit ? 'Edit Note' : 'New Note') +
    '</h3><form id="note-form">' +
    '<label>Title</label><input type="text" id="note-title" value="' +
    (note ? escapeHtml(note.title || '') : '') +
    '" />' +
    '<label>Content</label><textarea id="note-body">' +
    (note ? escapeHtml(note.content || note.body || '') : '') +
    '</textarea>' +
    '<div style="display:flex;gap:10px;margin-top:16px">' +
    '<button type="submit" class="btn-primary" style="flex:1">' +
    (isEdit ? 'Update' : 'Save') +
    '</button>' +
    (isEdit
      ? '<button type="button" id="delete-note" class="btn-secondary">Delete</button>'
      : '') +
    '</div></form>';
  overlay.classList.remove('hidden');
  document.getElementById('note-form').addEventListener('submit', async e => {
    e.preventDefault();
    const body = {
      title: document.getElementById('note-title').value.trim(),
      content: document.getElementById('note-body').value.trim()
    };
    try {
      if (isEdit) {
        await api('/api/notes/' + note.id, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/notes', { method: 'POST', body: JSON.stringify(body) });
      }
      await loadNotes();
      closeModal();
      renderNotes();
    } catch (err) {
      alert(err.message);
    }
  });
  if (isEdit) {
    document.getElementById('delete-note').addEventListener('click', async () => {
      if (!confirm('Delete this note?')) return;
      try {
        await api('/api/notes/' + note.id, { method: 'DELETE' });
        await loadNotes();
        closeModal();
        renderNotes();
      } catch (err) {
        alert(err.message);
      }
    });
  }
}
document.getElementById('add-note-btn')?.addEventListener('click', () => openNoteModal(null));

/* ---------- Timer (local only) ---------- */
let timerInterval = null;
let timerSeconds = 25 * 60;
let timerRunning = false;

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60)
    .toString()
    .padStart(2, '0');
  const s = (timerSeconds % 60).toString().padStart(2, '0');
  const el = document.getElementById('timer-display');
  if (el) el.textContent = m + ':' + s;
}
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (timerRunning) return;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    timerSeconds = parseInt(btn.dataset.min) * 60;
    updateTimerDisplay();
  });
});
document.getElementById('timer-start')?.addEventListener('click', () => {
  if (timerRunning) return;
  timerRunning = true;
  document.getElementById('timer-start').disabled = true;
  document.getElementById('timer-pause').disabled = false;
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      document.getElementById('timer-start').disabled = false;
      document.getElementById('timer-pause').disabled = true;
      showBrowserNotification('StudySync', 'Focus session complete! Great work.');
      const active = document.querySelector('.mode-btn.active');
      timerSeconds = parseInt(active.dataset.min) * 60;
      updateTimerDisplay();
    }
  }, 1000);
});
document.getElementById('timer-pause')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
});
document.getElementById('timer-reset')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
  const active = document.querySelector('.mode-btn.active');
  timerSeconds = parseInt(active.dataset.min) * 60;
  updateTimerDisplay();
});

/* ---------- Notifications ---------- */
async function loadNotifications() {
  try {
    const data = await api('/api/notifications');
    state.notifications = Array.isArray(data) ? data : data.notifications || [];
  } catch (e) {
    state.notifications = [];
  }
}

function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  // Merge API notifications + local deadline reminders
  const items = [];
  state.notifications.forEach(n => {
    items.push({
      icon: n.isRead ? '🔕' : '🔔',
      title: n.title || n.message || 'Notification',
      time: n.createdAt ? formatDate(String(n.createdAt).slice(0, 10)) : ''
    });
  });
  const today = new Date().toISOString().slice(0, 10);
  allWorkItems()
    .filter(t => !t.completed && t.due)
    .forEach(t => {
      const due = t.due.slice(0, 10);
      if (due < today)
        items.push({
          icon: '⚠️',
          title: 'Overdue: ' + t.title,
          time: 'Was due ' + formatDate(due)
        });
      else if (due === today)
        items.push({ icon: '📅', title: 'Due today: ' + t.title, time: 'Today' });
    });

  if (!items.length) {
    list.innerHTML =
      '<div class="empty-state"><span>🔕</span>No notifications right now</div>';
    return;
  }
  list.innerHTML = items
    .map(
      n =>
        '<div class="notif-item"><div class="n-icon">' +
        n.icon +
        '</div><div class="n-body"><div class="n-title">' +
        escapeHtml(n.title) +
        '</div><div class="n-time">' +
        n.time +
        '</div></div></div>'
    )
    .join('');
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag: 'studysync' });
  } catch (e) {}
}
function maybeNotifyProgress() {
  const items = allWorkItems();
  const total = items.length;
  const done = items.filter(t => t.completed).length;
  if (!total) return;
  const pct = Math.round((done / total) * 100);
  if ([25, 50, 75, 100].includes(pct)) {
    showBrowserNotification(
      'StudySync Progress',
      "You've completed " + pct + '% of your tasks. Keep going!'
    );
  }
}
function scheduleDeadlineChecks() {
  const check = () => {
    renderNotifications();
    allWorkItems()
      .filter(t => !t.completed && isDueToday(t))
      .forEach(t => showBrowserNotification('StudySync Reminder', 'Due today: ' + t.title));
  };
  check();
  setInterval(check, 30 * 60 * 1000);
}

/* ---------- Profile ---------- */
function renderProfile() {
  if (!state.user) return;
  const n = document.getElementById('profile-name');
  const e = document.getElementById('profile-email');
  const s = document.getElementById('profile-school');
  const l = document.getElementById('profile-level');
  if (n) n.value = state.user.name || '';
  if (e) e.value = state.user.email || '';
  if (s) s.value = state.user.school || '';
  if (l) l.value = state.user.level || '';
}

document.getElementById('save-profile')?.addEventListener('click', async () => {
  // Profile update endpoint may vary — keep local display updated
  const name = document.getElementById('profile-name').value.trim();
  state.user.name = name;
  state.user.school = document.getElementById('profile-school').value.trim();
  state.user.level = document.getElementById('profile-level').value.trim();
  const parts = name.split(/\s+/);
  state.user.firstName = parts[0] || name;
  state.user.lastName = parts.slice(1).join(' ') || '';
  localStorage.setItem(USER_KEY, JSON.stringify(state.user));
  updateUserChip();
  alert('Profile saved on this device.\n(Ask collaborator for PUT /api/users/profile if you need server-side profile updates.)');
});

function renderAll() {
  renderTasks(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
  renderUpcoming();
  updateStats();
  renderCalendar();
  renderTimetable();
  renderNotes();
  renderNotifications();
  renderProfile();
}

/* ---------- Boot ---------- */
(async function boot() {
  const auth = document.getElementById('auth-container');
  const app = document.getElementById('app');

  if (token) {
    try {
      await loadProfile();
      await loadAllData();
      enterApp();
      requestNotificationPermission();
      return;
    } catch (e) {
      token = null;
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }

  auth.classList.remove('hidden');
  auth.style.display = 'flex';
  app.classList.add('hidden');
  app.style.display = 'none';
  showAuthView('login-view');
})();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
