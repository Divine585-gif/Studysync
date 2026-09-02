/* StudySync frontend */
const TOKEN_KEY = 'studysync_token';
const USER_KEY = 'studysync_user';
let state = { user: null, tasks: [], classes: [], notes: [], notifications: [] };
let token = localStorage.getItem(TOKEN_KEY) || null;

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  let res;
  try {
    res = await fetch(path, { ...options, headers });
  } catch (err) {
    const isFile = location.protocol === 'file:';
    throw new Error(
      isFile
        ? 'Server is not running. Open a terminal in the studysync folder and run:\n\nnode server/server.js\n\nThen open http://localhost:3847 in your browser (do not open index.html as a file).'
        : 'Cannot reach the StudySync server. Make sure it is running:\n\nnode server/server.js\n\nThen open http://localhost:3847'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    forceLogout('Your session has expired. Please sign in again.');
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || 'Request failed');
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

async function saveRemote() {
  if (!token) return;
  try {
    await api('/api/data', {
      method: 'PUT',
      body: JSON.stringify({
        tasks: state.tasks,
        classes: state.classes,
        notes: state.notes,
        profile: { school: state.user?.school || '', level: state.user?.level || '' },
        name: state.user?.name
      })
    });
  } catch (e) { console.warn('Sync failed', e); }
}

async function loadRemote() {
  const data = await api('/api/data');
  state.tasks = data.tasks || [];
  state.classes = data.classes || [];
  state.notes = data.notes || [];
  if (data.profile) {
    state.user.school = data.profile.school || '';
    state.user.level = data.profile.level || '';
  }
}

function showAuthView(id) {
  document.querySelectorAll('.auth-card').forEach(c => c.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

document.getElementById('show-signup')?.addEventListener('click', e => { e.preventDefault(); showAuthView('signup-view'); });
document.getElementById('show-login')?.addEventListener('click', e => { e.preventDefault(); showAuthView('login-view'); });
document.getElementById('show-forgot')?.addEventListener('click', e => { e.preventDefault(); showAuthView('forgot-view'); });
document.getElementById('back-to-login')?.addEventListener('click', e => { e.preventDefault(); showAuthView('login-view'); });
document.querySelectorAll('.toggle-pass').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  });
});

document.getElementById('signup-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Creating...';
  try {
    await api('/api/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    showSuccessModal('Account created successfully!', 'You can now sign in with your email and password.', () => {
      document.getElementById('signup-form').reset();
      showAuthView('login-view');
      document.getElementById('login-email').value = email;
    });
  } catch (err) { alert(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Register'; }
});

document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const res = await api('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    token = res.token;
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(res.user));
    state.user = res.user;
    await loadRemote();
    enterApp();
    requestNotificationPermission();
  } catch (err) { alert(err.message); }
  finally { btn.disabled = false; btn.textContent = 'Sign in'; }
});

document.getElementById('forgot-form')?.addEventListener('submit', e => {
  e.preventDefault();
  alert('Password reset is not available in this demo. Please create a new account if needed.');
  showAuthView('login-view');
});

document.getElementById('logout-btn')?.addEventListener('click', () => {
  if (confirm('Log out of StudySync?')) forceLogout(null);
});

function enterApp() {
  const auth = document.getElementById('auth-container');
  const app = document.getElementById('app');
  auth.classList.add('hidden'); auth.style.display = 'none';
  app.classList.remove('hidden'); app.style.display = 'flex';
  document.getElementById('user-chip').textContent = (state.user?.name || 'Student').split(' ')[0];
  renderAll(); showView('dashboard'); generateReminders(); scheduleDeadlineChecks();
}

function showSuccessModal(title, message, onClose) {
  const overlay = document.getElementById('modal-overlay');
  const body = document.getElementById('modal-body');
  body.innerHTML = '<div style="text-align:center;padding:8px 0"><div style="font-size:2.5rem;margin-bottom:12px">✓</div><h3 style="margin-bottom:8px">' +
    escapeHtml(title) + '</h3><p style="color:var(--text-muted);margin-bottom:20px;font-size:0.95rem">' +
    escapeHtml(message) + '</p><button type="button" class="btn-primary" id="success-ok" style="margin-top:0">Continue to Sign In</button></div>';
  overlay.classList.remove('hidden');
  document.getElementById('success-ok').onclick = () => { closeModal(); if (onClose) onClose(); };
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = document.getElementById('view-' + name);
  if (viewEl) viewEl.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const titles = { dashboard: 'Dashboard', tasks: 'Tasks & Projects', calendar: 'Calendar', timetable: 'Class Timetable', notes: 'Notes', timer: 'Study Timer', progress: 'Progress', notifications: 'Notifications', profile: 'Profile' };
  document.getElementById('page-title').textContent = titles[name] || name;
}

document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
document.querySelectorAll('.qa-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
document.querySelectorAll('.mobile-nav-btn').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function isOverdue(task) {
  if (task.completed || !task.due) return false;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(task.due) < today;
}
function isDueToday(task) {
  if (task.completed || !task.due) return false;
  return task.due === new Date().toISOString().slice(0, 10);
}

function renderTasks(filter) {
  filter = filter || 'all';
  const list = document.getElementById('tasks-list');
  if (!list) return;
  let tasks = [...state.tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return (a.due || '9999') > (b.due || '9999') ? 1 : -1;
  });
  if (filter === 'pending') tasks = tasks.filter(t => !t.completed);
  if (filter === 'completed') tasks = tasks.filter(t => t.completed);
  if (filter === 'overdue') tasks = tasks.filter(t => isOverdue(t));
  if (!tasks.length) {
    list.innerHTML = '<div class="empty-state"><span>📭</span>No tasks yet. Add an assignment or project!</div>';
    return;
  }
  list.innerHTML = tasks.map(t =>
    '<div class="task-item ' + (t.completed ? 'completed' : '') + '" data-id="' + t.id + '">' +
    '<button class="task-check ' + (t.completed ? 'done' : '') + '" data-action="toggle">' + (t.completed ? '✓' : '') + '</button>' +
    '<div class="task-body"><div class="task-title">' + escapeHtml(t.title) + '</div><div class="task-meta">' +
    (t.due ? '<span class="due ' + (isOverdue(t) ? 'overdue' : '') + '">Due: ' + formatDate(t.due) + '</span>' : '') +
    (t.course ? '<span class="tag">' + escapeHtml(t.course) + '</span>' : '') +
    (t.priority ? '<span class="tag">' + t.priority + '</span>' : '') +
    (t.type ? '<span class="tag">' + t.type + '</span>' : '') +
    '</div></div><div class="task-actions"><button data-action="edit">✏️</button><button data-action="delete">🗑️</button></div></div>'
  ).join('');
}

function renderUpcoming() {
  const list = document.getElementById('upcoming-list');
  if (!list) return;
  const upcoming = state.tasks.filter(t => !t.completed && t.due).sort((a,b) => a.due > b.due ? 1 : -1).slice(0, 5);
  if (!upcoming.length) {
    list.innerHTML = '<div class="empty-state" style="padding:20px"><span>🎉</span>No upcoming deadlines</div>';
    return;
  }
  list.innerHTML = upcoming.map(t =>
    '<div class="task-item"><div class="task-body"><div class="task-title">' + escapeHtml(t.title) +
    '</div><div class="task-meta"><span class="due ' + (isOverdue(t) ? 'overdue' : '') + '">' + formatDate(t.due) +
    '</span>' + (t.course ? '<span class="tag">' + escapeHtml(t.course) + '</span>' : '') + '</div></div></div>'
  ).join('');
}

function updateStats() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('stat-pending', state.tasks.filter(t => !t.completed).length);
  set('stat-completed', state.tasks.filter(t => t.completed).length);
  set('stat-today', state.tasks.filter(t => isDueToday(t)).length);
  set('stat-overdue', state.tasks.filter(t => isOverdue(t)).length);
  const total = state.tasks.length;
  const completed = state.tasks.filter(t => t.completed).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const bar = document.getElementById('completion-bar');
  if (bar) bar.style.width = pct + '%';
  set('completion-pct', pct + '%');
  set('total-tasks', total);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  set('week-completed', state.tasks.filter(t => t.completed && t.completedAt && new Date(t.completedAt) >= weekAgo).length);
}

document.getElementById('tasks-list')?.addEventListener('click', async e => {
  const item = e.target.closest('.task-item');
  if (!item) return;
  const id = item.dataset.id;
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  if (action === 'toggle') {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    await saveRemote(); renderAll();
    if (task.completed) maybeNotifyProgress();
  }
  if (action === 'delete' && confirm('Delete this task?')) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    await saveRemote(); renderAll();
  }
  if (action === 'edit') openTaskModal(state.tasks.find(t => t.id === id));
});

document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTasks(btn.dataset.filter);
  });
});

const overlay = document.getElementById('modal-overlay');
const modalBody = document.getElementById('modal-body');
document.getElementById('modal-close')?.addEventListener('click', closeModal);
overlay?.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
function closeModal() { overlay.classList.add('hidden'); modalBody.innerHTML = ''; }

function openTaskModal(task) {
  const isEdit = !!task;
  modalBody.innerHTML = '<h3>' + (isEdit ? 'Edit Task / Project' : 'Add Task / Project') + '</h3><form id="task-form">' +
    '<label>Title*</label><input type="text" id="task-title" value="' + (task ? escapeHtml(task.title) : '') + '" required placeholder="e.g. CSC 301 Assignment 2" />' +
    '<label>Type</label><select id="task-type"><option value="Assignment">Assignment</option><option value="Project">Project</option><option value="Exam">Exam</option><option value="Other">Other</option></select>' +
    '<label>Course / Subject</label><input type="text" id="task-course" value="' + (task ? escapeHtml(task.course || '') : '') + '" placeholder="e.g. CSC 301" />' +
    '<div class="form-row"><div><label>Due Date</label><input type="date" id="task-due" value="' + (task?.due || '') + '" /></div>' +
    '<div><label>Priority</label><select id="task-priority"><option value="">None</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option></select></div></div>' +
    '<label>Notes</label><textarea id="task-notes">' + (task ? escapeHtml(task.notes || '') : '') + '</textarea>' +
    '<button type="submit" class="btn-primary">' + (isEdit ? 'Update' : 'Create') + '</button></form>';
  if (task) {
    document.getElementById('task-type').value = task.type || 'Assignment';
    document.getElementById('task-priority').value = task.priority || '';
  }
  overlay.classList.remove('hidden');
  document.getElementById('task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = {
      title: document.getElementById('task-title').value.trim(),
      type: document.getElementById('task-type').value,
      course: document.getElementById('task-course').value.trim(),
      due: document.getElementById('task-due').value || null,
      priority: document.getElementById('task-priority').value || null,
      notes: document.getElementById('task-notes').value.trim()
    };
    if (isEdit) Object.assign(task, data);
    else state.tasks.push({ id: uid(), ...data, completed: false, completedAt: null, createdAt: new Date().toISOString() });
    await saveRemote(); closeModal(); renderAll();
  });
}
document.getElementById('add-task-btn')?.addEventListener('click', () => openTaskModal(null));

let calDate = new Date(), selectedDay = null;
function renderCalendar() {
  const year = calDate.getFullYear(), month = calDate.getMonth();
  const title = document.getElementById('cal-month-year');
  if (title) title.textContent = calDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  let html = dayNames.map(d => '<div class="cal-day-name">' + d + '</div>').join('');
  for (let i = firstDay - 1; i >= 0; i--) html += '<div class="cal-day other-month">' + (daysInPrev - i) + '</div>';
  const todayStr = new Date().toISOString().slice(0, 10);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const hasTasks = state.tasks.some(t => t.due === dateStr);
    html += '<div class="cal-day ' + (dateStr === todayStr ? 'today' : '') + ' ' + (selectedDay === dateStr ? 'selected' : '') + '" data-date="' + dateStr + '">' + d + (hasTasks ? '<span class="dot"></span>' : '') + '</div>';
  }
  const totalCells = firstDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) html += '<div class="cal-day other-month">' + i + '</div>';
  grid.innerHTML = html;
  grid.querySelectorAll('.cal-day[data-date]').forEach(el => {
    el.addEventListener('click', () => { selectedDay = el.dataset.date; renderCalendar(); renderDayTasks(selectedDay); });
  });
}
function renderDayTasks(dateStr) {
  const list = document.getElementById('day-tasks');
  if (!list) return;
  const tasks = state.tasks.filter(t => t.due === dateStr);
  if (!tasks.length) { list.innerHTML = '<div class="empty-state" style="padding:16px">No tasks on this day</div>'; return; }
  list.innerHTML = tasks.map(t => '<div class="task-item ' + (t.completed ? 'completed' : '') + '"><div class="task-body"><div class="task-title">' + escapeHtml(t.title) + '</div><div class="task-meta">' + (t.course ? '<span class="tag">' + escapeHtml(t.course) + '</span>' : '') + (t.completed ? ' ✓ Done' : '') + '</div></div></div>').join('');
}
document.getElementById('prev-month')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

function renderTimetable() {
  const list = document.getElementById('timetable-list');
  if (!list) return;
  if (!state.classes.length) { list.innerHTML = '<div class="empty-state"><span>📚</span>No classes yet. Add your timetable!</div>'; return; }
  const order = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const sorted = [...state.classes].sort((a,b) => { const d = order.indexOf(a.day) - order.indexOf(b.day); return d !== 0 ? d : ((a.start||'') > (b.start||'') ? 1 : -1); });
  list.innerHTML = sorted.map(c =>
    '<div class="class-item" data-id="' + c.id + '"><div class="class-info"><strong>' + escapeHtml(c.course) + '</strong><span>' +
    (c.start || '--:--') + ' – ' + (c.end || '--:--') + (c.venue ? ' • ' + escapeHtml(c.venue) : '') +
    '</span></div><div style="display:flex;align-items:center;gap:10px"><span class="class-day">' + c.day +
    '</span><button class="del-class" style="background:none;border:none;color:#666;cursor:pointer">🗑️</button></div></div>'
  ).join('');
  list.querySelectorAll('.del-class').forEach(btn => {
    btn.addEventListener('click', async e => {
      const id = e.target.closest('.class-item').dataset.id;
      state.classes = state.classes.filter(c => c.id !== id);
      await saveRemote(); renderTimetable();
    });
  });
}
document.getElementById('add-class-btn')?.addEventListener('click', () => {
  modalBody.innerHTML = '<h3>Add Class</h3><form id="class-form"><label>Course Name*</label><input type="text" id="class-course" required placeholder="e.g. CSC 301" />' +
    '<label>Day*</label><select id="class-day"><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option><option>Sunday</option></select>' +
    '<div class="form-row"><div><label>Start</label><input type="time" id="class-start" /></div><div><label>End</label><input type="time" id="class-end" /></div></div>' +
    '<label>Venue</label><input type="text" id="class-venue" placeholder="e.g. LT 2" /><button type="submit" class="btn-primary">Add Class</button></form>';
  overlay.classList.remove('hidden');
  document.getElementById('class-form').addEventListener('submit', async e => {
    e.preventDefault();
    state.classes.push({ id: uid(), course: document.getElementById('class-course').value.trim(), day: document.getElementById('class-day').value, start: document.getElementById('class-start').value, end: document.getElementById('class-end').value, venue: document.getElementById('class-venue').value.trim() });
    await saveRemote(); closeModal(); renderTimetable();
  });
});

function renderNotes() {
  const list = document.getElementById('notes-list');
  if (!list) return;
  if (!state.notes.length) { list.innerHTML = '<div class="empty-state"><span>📝</span>No notes yet</div>'; return; }
  list.innerHTML = state.notes.sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(n =>
    '<div class="note-card" data-id="' + n.id + '"><h4>' + escapeHtml(n.title || 'Untitled') + '</h4><p>' + escapeHtml(n.body || '') +
    '</p><div class="note-date">' + formatDate(n.updatedAt.slice(0,10)) + '</div></div>'
  ).join('');
  list.querySelectorAll('.note-card').forEach(card => {
    card.addEventListener('click', () => openNoteModal(state.notes.find(n => n.id === card.dataset.id)));
  });
}
function openNoteModal(note) {
  const isEdit = !!note;
  modalBody.innerHTML = '<h3>' + (isEdit ? 'Edit Note' : 'New Note') + '</h3><form id="note-form"><label>Title</label><input type="text" id="note-title" value="' +
    (note ? escapeHtml(note.title || '') : '') + '" /><label>Content</label><textarea id="note-body">' +
    (note ? escapeHtml(note.body || '') : '') + '</textarea><div style="display:flex;gap:10px;margin-top:16px">' +
    '<button type="submit" class="btn-primary" style="flex:1">' + (isEdit ? 'Update' : 'Save') + '</button>' +
    (isEdit ? '<button type="button" id="delete-note" class="btn-secondary">Delete</button>' : '') + '</div></form>';
  overlay.classList.remove('hidden');
  document.getElementById('note-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = document.getElementById('note-title').value.trim();
    const body = document.getElementById('note-body').value.trim();
    if (isEdit) { note.title = title; note.body = body; note.updatedAt = new Date().toISOString(); }
    else state.notes.push({ id: uid(), title, body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await saveRemote(); closeModal(); renderNotes();
  });
  if (isEdit) document.getElementById('delete-note').addEventListener('click', async () => {
    if (confirm('Delete this note?')) { state.notes = state.notes.filter(n => n.id !== note.id); await saveRemote(); closeModal(); renderNotes(); }
  });
}
document.getElementById('add-note-btn')?.addEventListener('click', () => openNoteModal(null));

let timerInterval = null, timerSeconds = 25 * 60, timerRunning = false;
function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
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
    timerSeconds--; updateTimerDisplay();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval); timerRunning = false;
      document.getElementById('timer-start').disabled = false;
      document.getElementById('timer-pause').disabled = true;
      showBrowserNotification('StudySync', 'Focus session complete! Great work.');
      const active = document.querySelector('.mode-btn.active');
      timerSeconds = parseInt(active.dataset.min) * 60; updateTimerDisplay();
    }
  }, 1000);
});
document.getElementById('timer-pause')?.addEventListener('click', () => {
  clearInterval(timerInterval); timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
});
document.getElementById('timer-reset')?.addEventListener('click', () => {
  clearInterval(timerInterval); timerRunning = false;
  document.getElementById('timer-start').disabled = false;
  document.getElementById('timer-pause').disabled = true;
  const active = document.querySelector('.mode-btn.active');
  timerSeconds = parseInt(active.dataset.min) * 60; updateTimerDisplay();
});

function generateReminders() {
  const notifs = [], today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomStr = tomorrow.toISOString().slice(0, 10);
  state.tasks.filter(t => !t.completed && t.due).forEach(t => {
    if (t.due < today) notifs.push({ id: 'o-' + t.id, icon: '⚠️', title: 'Overdue: ' + t.title, time: 'Was due ' + formatDate(t.due) });
    else if (t.due === today) notifs.push({ id: 't-' + t.id, icon: '📅', title: 'Due today: ' + t.title, time: 'Today' });
    else if (t.due === tomStr) notifs.push({ id: 'm-' + t.id, icon: '🔔', title: 'Due tomorrow: ' + t.title, time: 'Tomorrow' });
  });
  state.notifications = notifs; renderNotifications();
}
function renderNotifications() {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!state.notifications.length) { list.innerHTML = '<div class="empty-state"><span>🔕</span>No notifications right now</div>'; return; }
  list.innerHTML = state.notifications.map(n =>
    '<div class="notif-item"><div class="n-icon">' + n.icon + '</div><div class="n-body"><div class="n-title">' + escapeHtml(n.title) +
    '</div><div class="n-time">' + n.time + '</div></div></div>'
  ).join('');
}
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
}
function showBrowserNotification(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { new Notification(title, { body: body, tag: 'studysync' }); } catch (e) {}
}
function maybeNotifyProgress() {
  const total = state.tasks.length, done = state.tasks.filter(t => t.completed).length;
  if (!total) return;
  const pct = Math.round((done / total) * 100);
  if ([25, 50, 75, 100].includes(pct)) showBrowserNotification('StudySync Progress', "You've completed " + pct + "% of your tasks. Keep going!");
}
function scheduleDeadlineChecks() {
  const check = () => {
    generateReminders();
    state.tasks.filter(t => !t.completed && isDueToday(t)).forEach(t => showBrowserNotification('StudySync Reminder', 'Due today: ' + t.title));
    state.tasks.filter(t => isOverdue(t)).slice(0, 3).forEach(t => showBrowserNotification('StudySync', 'Overdue: ' + t.title));
  };
  check();
  setInterval(check, 30 * 60 * 1000);
}

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
  try {
    const res = await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: document.getElementById('profile-name').value.trim(),
        school: document.getElementById('profile-school').value.trim(),
        level: document.getElementById('profile-level').value.trim()
      })
    });
    state.user = res.user;
    localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    document.getElementById('user-chip').textContent = state.user.name.split(' ')[0];
    alert('Profile saved!');
  } catch (err) { alert(err.message); }
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function renderAll() {
  renderTasks(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
  renderUpcoming(); updateStats(); renderCalendar(); renderTimetable(); renderNotes(); renderNotifications(); renderProfile();
}

(async function boot() {
  const auth = document.getElementById('auth-container');
  const app = document.getElementById('app');
  if (token) {
    try {
      const res = await api('/api/me');
      state.user = res.user;
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      await loadRemote();
      enterApp();
      requestNotificationPermission();
      return;
    } catch { token = null; localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
  }
  auth.classList.remove('hidden'); auth.style.display = 'flex';
  app.classList.add('hidden'); app.style.display = 'none';
  showAuthView('login-view');
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
