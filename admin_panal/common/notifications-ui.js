/**
 * Shared notifications feed UI for parent, teacher, driver, and admin portals.
 */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function getNotificationCategoryMeta(category) {
  const key = String(category || 'general').trim().toLowerCase();
  const map = {
    general: { icon: '📢', label: 'General', class: 'notif-cat-general' },
    attendance: { icon: '✅', label: 'Attendance', class: 'notif-cat-attendance' },
    marks: { icon: '📝', label: 'Marks', class: 'notif-cat-marks' },
    bus: { icon: '🚌', label: 'Bus', class: 'notif-cat-bus' },
    exam: { icon: '📋', label: 'Exam', class: 'notif-cat-exam' },
    exams: { icon: '📋', label: 'Exam', class: 'notif-cat-exam' },
    urgent: { icon: '⚠️', label: 'Urgent', class: 'notif-cat-urgent' },
    important: { icon: '⭐', label: 'Important', class: 'notif-cat-urgent' },
    holiday: { icon: '🏖️', label: 'Holiday', class: 'notif-cat-holiday' },
    event: { icon: '📅', label: 'Event', class: 'notif-cat-event' },
  };
  return map[key] || { icon: '🔔', label: category || 'General', class: 'notif-cat-general' };
}

export function formatNotificationTime(time) {
  if (time === undefined || time === null || time === '') return { display: '', title: '' };
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return { display: String(time), title: '' };
  const full = d.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60000);
  let relative = full;
  if (mins < 1) relative = 'Just now';
  else if (mins < 60) relative = `${mins}m ago`;
  else if (mins < 1440) relative = `${Math.floor(mins / 60)}h ago`;
  else if (mins < 10080) relative = `${Math.floor(mins / 1440)}d ago`;
  return { display: relative, title: full };
}

export function audienceLabel(role) {
  const r = String(role || 'all').toLowerCase();
  const labels = {
    all: 'Everyone',
    teacher: 'Teachers',
    parent: 'Parents',
    driver: 'Drivers',
    admin: 'Admins',
    student: 'Students',
  };
  return labels[r] || role;
}

/**
 * Fetch notifications for one or more roles (avoids composite index on role+time).
 */
export async function fetchNotificationsForRoles(db, firestore, roles) {
  const { collection, query, where, getDocs } = firestore;
  const items = [];
  const seen = new Set();
  for (const role of roles) {
    const snap = await getDocs(query(collection(db, 'notifications'), where('role', '==', role)));
    snap.forEach(d => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      items.push({ id: d.id, ...d.data() });
    });
  }
  items.sort((a, b) => {
    const ta = new Date(a.time || 0).getTime();
    const tb = new Date(b.time || 0).getTime();
    return tb - ta;
  });
  return items;
}

export function renderNotificationCard(notification, options = {}) {
  const n = notification || {};
  const meta = getNotificationCategoryMeta(n.category);
  const time = formatNotificationTime(n.time);
  const title = escapeHtml(n.title || 'Notification');
  const message = escapeHtml(n.message || '').replace(/\n/g, '<br>');
  const showAudience = options.showAudience && n.role;
  const showDelete = options.showDelete && n.id;
  const deleteHandler = options.deleteHandlerName || 'deleteNotification';

  return `
    <article class="notif-card ${meta.class}" data-id="${escapeHtml(n.id || '')}">
      <div class="notif-card-accent"></div>
      <div class="notif-card-body">
        <div class="notif-card-top">
          <div class="notif-card-icon" aria-hidden="true">${meta.icon}</div>
          <div class="notif-card-meta">
            <span class="notif-category-pill">${escapeHtml(meta.label)}</span>
            ${showAudience ? `<span class="notif-audience-pill">${escapeHtml(audienceLabel(n.role))}</span>` : ''}
            <time class="notif-time" datetime="${escapeHtml(n.time || '')}" title="${escapeHtml(time.title)}">${escapeHtml(time.display)}</time>
          </div>
          ${showDelete ? `<button type="button" class="notif-delete-btn" onclick="${deleteHandler}('${escapeHtml(n.id)}')" title="Delete">×</button>` : ''}
        </div>
        <h3 class="notif-card-title">${title}</h3>
        <p class="notif-card-message">${message || '<em>No message</em>'}</p>
      </div>
    </article>
  `;
}

export function renderNotificationsPage(options = {}) {
  const {
    pageTitle = 'Notifications',
    pageSubtitle = 'Updates and announcements from your school.',
    notifications = [],
    emptyTitle = 'All caught up',
    emptyMessage = 'No notifications right now. Check back later.',
    showAudience = false,
    showDelete = false,
    deleteHandlerName = 'deleteNotification',
    extraHtml = '',
  } = options;

  const header = `
    <div class="page-header notif-page-header">
      <div>
        <h1>${escapeHtml(pageTitle)}</h1>
        <p>${escapeHtml(pageSubtitle)}</p>
      </div>
      <div class="notif-header-badge" aria-hidden="true">🔔</div>
    </div>
  `;

  if (!notifications.length) {
    return `
      ${header}
      ${extraHtml}
      <div class="notif-empty-state">
        <div class="notif-empty-icon">🔔</div>
        <h3>${escapeHtml(emptyTitle)}</h3>
        <p>${escapeHtml(emptyMessage)}</p>
      </div>
    `;
  }

  const cards = notifications
    .map(n =>
      renderNotificationCard(n, { showAudience, showDelete, deleteHandlerName })
    )
    .join('');

  return `
    ${header}
    ${extraHtml}
    <div class="notif-feed-count">${notifications.length} notification${notifications.length === 1 ? '' : 's'}</div>
    <div class="notif-feed">${cards}</div>
  `;
}

export function renderNotificationsLoading(pageTitle = 'Notifications') {
  return `
    <div class="page-header notif-page-header">
      <div><h1>${escapeHtml(pageTitle)}</h1><p>Loading updates…</p></div>
    </div>
    <div class="loading notif-loading">Loading notifications…</div>
  `;
}

export function renderNotificationsError(pageTitle, message) {
  return `
    <div class="page-header notif-page-header">
      <div><h1>${escapeHtml(pageTitle)}</h1></div>
    </div>
    <div class="error notif-error">${escapeHtml(message || 'Could not load notifications.')}</div>
  `;
}
