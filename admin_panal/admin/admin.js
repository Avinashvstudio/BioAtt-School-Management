import '../common/auth.js';
import { onAuthChange, logout } from '../common/auth.js';
import { getFirestore, collection, query, where, getDocs, getDoc, setDoc, doc, deleteDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { app } from '../common/firebase-init.js';
import {
  renderNotificationsPage,
  renderNotificationsLoading,
  renderNotificationsError,
} from '../common/notifications-ui.js';

const db = getFirestore(app);
const auth = getAuth(app);
const appDiv = document.getElementById('app');

let currentSection = 'dashboard';
let currentAdminUser = null;

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toast(message, type = 'info') {
  const container = document.getElementById('admin-toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `admin-toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function adminApi(path, method, body) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

async function updateDocOrAdmin(collectionName, docId, payload) {
  try {
    await updateDoc(doc(db, collectionName, docId), payload);
  } catch (err) {
    if (err.code === 'permission-denied') {
      await adminApi(`/api/admin/${collectionName}/${docId}`, 'PUT', payload);
      return;
    }
    throw err;
  }
}

async function deleteDocOrAdmin(collectionName, docId) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
  } catch (err) {
    if (err.code === 'permission-denied') {
      await adminApi(`/api/admin/${collectionName}/${docId}`, 'DELETE');
      return;
    }
    throw err;
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchTeachers() {
  const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
  const teachers = [];
  snap.forEach(d => {
    const t = d.data();
    teachers.push({ id: d.id, name: t.name || t.email || d.id, email: t.email || '' });
  });
  return teachers;
}

async function fetchDrivers() {
  const snap = await getDocs(collection(db, 'users'));
  const drivers = [];
  snap.forEach(d => {
    const u = d.data();
    if ((u.role || '').trim().toLowerCase() !== 'driver') return;
    drivers.push({ id: d.id, name: u.name || u.email || d.id, email: u.email || '' });
  });
  return drivers.sort((a, b) => a.name.localeCompare(b.name));
}

function busDocId(number) {
  const n = (number || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
  return n ? `bus_${n}` : `bus_${Date.now()}`;
}

async function studentsLinkedToBus(busNumber) {
  const label = (busNumber || '').trim();
  if (!label) return { studentIds: [], students: [] };
  const snap = await getDocs(collection(db, 'students'));
  const studentIds = [];
  const students = [];
  snap.forEach(d => {
    const s = d.data();
    if ((s.bus || '').trim() !== label) return;
    studentIds.push(d.id);
    students.push({
      id: d.id,
      name: s.name || d.id,
      parentEmail: s.parentEmail || '',
      class: s.class || '',
      section: s.section || '',
    });
  });
  students.sort((a, b) => a.name.localeCompare(b.name));
  return { studentIds, students };
}

async function refreshBusStudentListsForNumber(busNumber) {
  const label = (busNumber || '').trim();
  if (!label) return;
  const busSnap = await getDocs(query(collection(db, 'buses'), where('number', '==', label)));
  if (busSnap.empty) return;
  const { studentIds, students } = await studentsLinkedToBus(label);
  await Promise.all(busSnap.docs.map(d =>
    setDoc(doc(db, 'buses', d.id), {
      studentIds,
      students,
      updatedAt: new Date().toISOString(),
    }, { merge: true })
  ));
}

async function fetchClassesList() {
  const snap = await getDocs(collection(db, 'classes'));
  const list = [];
  snap.forEach(d => list.push({ id: d.id, ...d.data() }));
  return list;
}

/** Split stored section field into single sections (fixes legacy "A,B,C" rows). */
function parseSectionList(sectionField) {
  return parseCsv(sectionField)
    .map(s => normalizeSection(s))
    .filter(Boolean);
}

function assertSingleSectionInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Section is required (e.g. A).';
  if (/[,;/|&]/.test(text)) {
    return 'Enter one section only (e.g. A). Create a separate class for each section.';
  }
  const section = normalizeSection(text);
  if (!section) return 'Invalid section.';
  return null;
}

function classSectionOptionKey(className, section) {
  return `${normalizeClassName(className)}__${normalizeSection(section)}`;
}

/** One dropdown row per class + single section (deduped). */
function listClassSectionOptions(classes) {
  const seen = new Set();
  const options = [];
  for (const c of classes) {
    const className = normalizeClassName(c.name);
    const sections = parseSectionList(c.section);
    const secList = sections.length ? sections : [normalizeSection(c.section)].filter(Boolean);
    for (const section of secList) {
      const key = classSectionOptionKey(className, section);
      if (seen.has(key)) continue;
      seen.add(key);
      options.push({
        className,
        section,
        label: `${c.name || className} — Section ${section}`,
        value: key,
      });
    }
  }
  options.sort((a, b) =>
    `${a.className}${a.section}`.localeCompare(`${b.className}${b.section}`, undefined, { numeric: true })
  );
  return options;
}

async function buildClassSectionSelectHtml(selectedClass = '', selectedSection = '') {
  const classes = await fetchClassesList();
  const selectedKey = selectedClass && selectedSection
    ? classSectionOptionKey(selectedClass, selectedSection)
    : '';
  if (!classes.length) {
    return {
      html: '<option value="">No classes yet — create a class first</option>',
      classes: [],
      hasClasses: false,
    };
  }
  const rows = listClassSectionOptions(classes);
  const options = rows.map(row => {
    const sel = row.value === selectedKey ? ' selected' : '';
    return `<option value="${escapeHtml(row.value)}"${sel}>${escapeHtml(row.label)}</option>`;
  }).join('');
  return {
    html: `<option value="">Select class &amp; section</option>${options}`,
    classes,
    hasClasses: true,
  };
}

function parseClassSectionSelect(value) {
  const raw = value || '';
  const sep = raw.indexOf('__');
  if (sep < 0) {
    return { className: '', section: '' };
  }
  return {
    className: normalizeClassName(raw.slice(0, sep)),
    section: normalizeSection(raw.slice(sep + 2)),
  };
}

function classDocId(name, section) {
  const n = normalizeClassName(name).replace(/\s+/g, '_');
  const s = normalizeSection(section);
  return `class_${n}_${s}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function buildStudentLookup(studentsSnap) {
  const byId = {};
  studentsSnap.forEach(d => {
    const s = d.data();
    byId[d.id] = s.name || d.id;
  });
  return byId;
}

function resolveStudentDisplay(record, studentById) {
  if (record.studentName) return record.studentName;
  if (record.studentId && studentById[record.studentId]) return studentById[record.studentId];
  if (record.studentId) return `Unknown (${String(record.studentId).slice(0, 10)}…)`;
  return '—';
}

function formatClassSection(cls, section) {
  let c = (cls || '').trim();
  const s = (section || '').trim();
  if (!c && !s) return '—';
  if (c && !/^class\s/i.test(c)) c = `Class ${c}`;
  return s ? `${c} - Section ${s}` : c;
}

function normalizeEmailKey(email) {
  return (email || '').trim().toLowerCase();
}

/** parentEmail (lowercase) -> [{ id, name, class, section }, ...] */
function buildParentChildrenMap(studentsSnap) {
  const map = {};
  studentsSnap.forEach(d => {
    const s = d.data();
    const key = normalizeEmailKey(s.parentEmail);
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push({
      id: d.id,
      name: s.name || d.id,
      class: s.class || '',
      section: s.section || '',
    });
  });
  return map;
}

function formatParentChildrenSummary(children) {
  if (!children || !children.length) {
    return '<span class="text-muted">No linked students</span>';
  }
  return children
    .map(c => {
      const cs = formatClassSection(c.class, c.section);
      return `<span class="parent-child-chip" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}: ${escapeHtml(cs)}</span>`;
    })
    .join(' ');
}

function parentChildrenClassKeys(children) {
  if (!children || !children.length) return '';
  return [...new Set(children.map(c => normalizeClassName(c.class)).filter(Boolean))].join(',');
}

function renderParentChildrenEditor(children, parentEmail) {
  if (!children.length) {
    return `
      <div class="form-group parent-fields" style="grid-column:1/-1">
        <label>Children (Class / Section)</label>
        <p class="form-hint">No students linked to <strong>${escapeHtml(parentEmail)}</strong>. Add or edit a student in <strong>Students</strong> and set Parent Email to this address.</p>
      </div>`;
  }
  let rows = children.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(formatClassSection(c.class, c.section))}</td>
      <td>
        <button type="button" class="btn btn-sm btn-secondary" onclick="editStudent('${c.id}')">Edit student</button>
      </td>
    </tr>
  `).join('');
  return `
    <div class="form-group parent-fields" style="grid-column:1/-1">
      <label>Children (Class / Section)</label>
      <p class="form-hint">Linked via student <em>Parent Email</em>. To change class/section, edit the student record.</p>
      <table class="data-table" style="margin-top:8px">
        <thead><tr><th>Student</th><th>Class / Section</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function statusPillClass(status) {
  if (status === 'Present') return 'status-present';
  if (status === 'Absent') return 'status-absent';
  if (status === 'Left for Home') return 'status-left';
  return '';
}

function normalizeClassName(input) {
  return (input || '').trim().replace(/\s+/g, ' ');
}

function normalizeSection(input) {
  const raw = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  return raw.split(/[,;/|&]+/)[0].slice(0, 4);
}

function normalizeCsvList(input) {
  return (input || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .join(', ');
}

function parseCsv(input) {
  return (input || '').split(',').map(s => s.trim()).filter(Boolean);
}

function renderDashboard(user) {
  currentAdminUser = user;
  appDiv.innerHTML = `
    <div class="portal-layout">
      <header class="portal-header">
        <div class="header-left">
          <h1 class="portal-title">BioAtt School</h1>
          <div class="brand-sub">Administration Panel</div>
        </div>
        <div class="header-right">
          <span class="user-info">${escapeHtml(user.email)}</span>
          <button class="logout-btn" id="logout-btn" type="button">
            <span class="logout-text">Logout</span>
            <span class="logout-loading" style="display: none;">…</span>
          </button>
        </div>
      </header>
      
      <div class="portal-main">
        <nav class="portal-sidebar">
          <div class="nav-section-label">Overview</div>
          <button class="nav-btn active" id="nav-dashboard" type="button">
            <span class="nav-icon">📊</span> Dashboard
          </button>
          <div class="nav-section-label">Academics</div>
          <button class="nav-btn" id="nav-students" type="button">
            <span class="nav-icon">🎓</span> Students
          </button>
          <button class="nav-btn" id="nav-classes" type="button">
            <span class="nav-icon">🏫</span> Classes
          </button>
          <button class="nav-btn" id="nav-timetable" type="button">
            <span class="nav-icon">📅</span> Timetable
          </button>
          <button class="nav-btn" id="nav-exams" type="button">
            <span class="nav-icon">📝</span> Exams
          </button>
          <button class="nav-btn" id="nav-attendance" type="button">
            <span class="nav-icon">✅</span> Attendance
          </button>
          <div class="nav-section-label">People</div>
          <button class="nav-btn" id="nav-users" type="button">
            <span class="nav-icon">👥</span> Users
          </button>
          <button class="nav-btn" id="nav-notifications" type="button">
            <span class="nav-icon">🔔</span> Notifications
          </button>
          <div class="nav-section-label">Transport</div>
          <button class="nav-btn" id="nav-buses" type="button">
            <span class="nav-icon">🚌</span> Buses & Routes
          </button>
          <div class="nav-section-label">System</div>
          <button class="nav-btn" id="nav-reports" type="button">
            <span class="nav-icon">📈</span> Reports
          </button>
          <button class="nav-btn" id="nav-settings" type="button">
            <span class="nav-icon">⚙️</span> Settings
          </button>
        </nav>
        
        <main class="portal-content">
          <div id="feature-content"></div>
        </main>
      </div>
    </div>
  `;
  
   const navs = [
     { id: 'nav-dashboard', section: 'dashboard', fn: showDashboard },
     { id: 'nav-students', section: 'students', fn: showStudentManagement },
     { id: 'nav-classes', section: 'classes', fn: showClassManagement },
     { id: 'nav-timetable', section: 'timetable', fn: showTimetableManagement },
     { id: 'nav-exams', section: 'exams', fn: showExamManagement },
     { id: 'nav-attendance', section: 'attendance', fn: showAttendanceManagement },
     { id: 'nav-users', section: 'users', fn: showUserManagement },
     { id: 'nav-notifications', section: 'notifications', fn: showNotificationManagement },
     { id: 'nav-buses', section: 'buses', fn: showBusManagement },
     { id: 'nav-reports', section: 'reports', fn: showReports },
     { id: 'nav-settings', section: 'settings', fn: showSettings },
   ];
   
   navs.forEach(({ id, section, fn }) => {
     document.getElementById(id).onclick = () => {
       setActiveNav(section);
       fn(user);
     };
   });
   
   // Set up logout button
   const logoutBtn = document.getElementById('logout-btn');
   if (logoutBtn) {
     logoutBtn.addEventListener('click', () => handleLogout());
   }
   
   setActiveNav(currentSection);
   showDashboard(user);
}

function setActiveNav(section) {
  currentSection = section;
  [
    'nav-dashboard',
    'nav-users',
    'nav-students',
    'nav-classes',
    'nav-timetable',
    'nav-exams',
    'nav-attendance',
    'nav-notifications',
    'nav-buses',
    'nav-reports',
    'nav-settings',
  ].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.classList.remove('active');
      if (id === `nav-${section}`) {
        btn.classList.add('active');
      }
    }
  });
}

async function showDashboard(user) {
  setActiveNav('dashboard');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>System Overview</h1>
      <p>Welcome to the Admin Dashboard. Monitor system statistics and manage your school.</p>
    </div>
    
    <div class="loading" id="dashboard-loading">Loading dashboard data...</div>
  `;
  
  try {
    console.log('Fetching dashboard data...');
    
    // Fetch system statistics with error handling
    let totalUsers = 0, totalStudents = 0, totalClasses = 0, todayPresent = 0, todayAbsent = 0;
    
    try {
      const usersSnap = await getDocs(collection(db, 'users'));
      totalUsers = usersSnap.size;
      console.log('Users loaded:', totalUsers);
    } catch (e) {
      console.warn('Could not load users:', e);
    }
    
    try {
      const studentsSnap = await getDocs(collection(db, 'students'));
      totalStudents = studentsSnap.size;
      console.log('Students loaded:', totalStudents);
    } catch (e) {
      console.warn('Could not load students:', e);
    }
    
    try {
      const classesSnap = await getDocs(collection(db, 'classes'));
      totalClasses = classesSnap.size;
      console.log('Classes loaded:', totalClasses);
    } catch (e) {
      console.warn('Could not load classes:', e);
    }
    
    try {
      const attendanceSnap = await getDocs(collection(db, 'attendance'));
      // Calculate today's attendance
      const today = new Date().toISOString().slice(0, 10);
      attendanceSnap.forEach(doc => {
        const a = doc.data();
        if (a.date === today) {
          if (a.status === 'Present') todayPresent++;
          else if (a.status === 'Absent') todayAbsent++;
        }
      });
      console.log('Attendance loaded:', todayPresent + todayAbsent);
    } catch (e) {
      console.warn('Could not load attendance:', e);
    }
    
    const attendanceRate = totalStudents > 0 ? Math.round((todayPresent / totalStudents) * 100) : 0;
    
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>System Overview</h1>
        <p>Welcome to the Admin Dashboard. Monitor system statistics and manage your school.</p>
      </div>
      
      <div class="dashboard-stats">
        <div class="stat-card">
          <div class="stat-icon">👥</div>
          <div class="stat-content">
            <h3>Total Users</h3>
            <div class="stat-number">${totalUsers}</div>
            <div class="stat-detail">Registered users</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">🎓</div>
          <div class="stat-content">
            <h3>Total Students</h3>
            <div class="stat-number">${totalStudents}</div>
            <div class="stat-detail">Enrolled students</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">🏫</div>
          <div class="stat-content">
            <h3>Total Classes</h3>
            <div class="stat-number">${totalClasses}</div>
            <div class="stat-detail">Active classes</div>
          </div>
        </div>
        
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <h3>Today's Attendance</h3>
            <div class="stat-number">${attendanceRate}%</div>
            <div class="stat-detail">${todayPresent} Present, ${todayAbsent} Absent</div>
          </div>
        </div>
      </div>
      
      <div class="quick-actions">
        <h2>Quick Actions</h2>
        <div class="action-grid">
          <button onclick="showUserManagement()" class="action-btn primary">
            <span class="action-icon">➕</span>
            Add New User
          </button>
          <button onclick="showStudentManagement()" class="action-btn primary">
            <span class="action-icon">🎓</span>
            Add Student
          </button>
          <button onclick="showClassManagement()" class="action-btn primary">
            <span class="action-icon">🏫</span>
            Create Class
          </button>
          <button onclick="showReports()" class="action-btn secondary">
            <span class="action-icon">📈</span>
            Generate Report
          </button>
        </div>
      </div>
      
      <div class="system-status">
        <h2>System Status</h2>
        <div class="status-grid">
          <div class="status-item">
            <span class="status-label">Firebase Connection:</span>
            <span class="status-value success">✅ Connected</span>
          </div>
          <div class="status-item">
            <span class="status-label">Database Access:</span>
            <span class="status-value success">✅ Accessible</span>
          </div>
          <div class="status-item">
            <span class="status-label">Current User:</span>
            <span class="status-value info">${user.email}</span>
          </div>
          <div class="status-item">
            <span class="status-label">User Role:</span>
            <span class="status-value info">Admin</span>
          </div>
        </div>
      </div>
    `;
    
    console.log('Dashboard loaded successfully');
    
  } catch (e) {
    console.error('Dashboard error:', e);
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>System Overview</h1>
        <p>Welcome to the Admin Dashboard. Monitor system statistics and manage your school.</p>
      </div>
      
      <div class="error-message">
        <h3>⚠️ Dashboard Error</h3>
        <p>There was an issue loading the dashboard data. This might be due to:</p>
        <ul>
          <li>Firebase permissions not properly configured</li>
          <li>Network connectivity issues</li>
          <li>Database structure changes</li>
        </ul>
        <div class="error-actions">
          <button onclick="showDashboard()" class="retry-btn">🔄 Retry</button>
          <button onclick="showUserManagement()" class="action-btn">👥 Manage Users</button>
        </div>
      </div>
    `;
  }
}

async function showUserManagement(user) {
  setActiveNav('users');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>User Management</h1>
      <p>Manage system users including teachers, parents, and drivers.</p>
    </div>
    <div class="loading">Loading users...</div>
  `;
  
  try {
    const [usersSnap, studentsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'students')),
    ]);
    const users = [];
    usersSnap.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    const parentChildrenMap = buildParentChildrenMap(studentsSnap);

    const uniqueRoles = [...new Set(users.map(u => u.role).filter(Boolean))].sort();
    const classSet = new Set();
    users.forEach(u => {
      if (u.className) classSet.add(u.className);
      if (u.role === 'parent') {
        const kids = parentChildrenMap[normalizeEmailKey(u.email)] || [];
        kids.forEach(c => {
          if (c.class) classSet.add(normalizeClassName(c.class));
        });
      }
    });
    const uniqueClasses = [...classSet].filter(Boolean).sort();
    
    let html = `
      <div class="page-header">
        <h1>User Management</h1>
        <p>Manage system users including teachers, parents, and drivers.</p>
      </div>
      
      <div class="section-header">
        <h2>All Users</h2>
        <button id="add-user-btn" class="btn btn-primary">
          <span class="btn-icon">➕</span>
          Add New User
        </button>
      </div>
      
      <div class="filters-section">
        <div class="filter-row">
          <div class="filter-group">
            <label for="search-name">Search by Name:</label>
            <input type="text" id="search-name" placeholder="Enter user name..." class="filter-input">
          </div>
          
          <div class="filter-group">
            <label for="filter-role">Filter by Role:</label>
            <select id="filter-role" class="filter-select">
              <option value="">All Roles</option>
              ${uniqueRoles.map(r => `<option value="${r}">${r.charAt(0).toUpperCase() + r.slice(1)}</option>`).join('')}
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-class">Filter by Class:</label>
            <select id="filter-class" class="filter-select">
              <option value="">All Classes</option>
              ${uniqueClasses.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          
          <div class="filter-group">
            <button id="clear-filters-btn" class="btn btn-secondary">
              <span class="btn-icon">🔄</span>
              Clear Filters
            </button>
          </div>
        </div>
        
        <div class="filter-stats">
          <span id="filter-count">Showing ${users.length} users</span>
        </div>
      </div>
      
      <div class="table-container">
        <table class="data-table" id="users-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Class/Section</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="users-tbody">
    `;
    
    users.forEach(u => {
      const children = u.role === 'parent' ? (parentChildrenMap[normalizeEmailKey(u.email)] || []) : [];
      let classSectionCell;
      let dataClass = u.className || '';
      if (u.role === 'parent') {
        classSectionCell = formatParentChildrenSummary(children);
        dataClass = parentChildrenClassKeys(children) || dataClass;
      } else if (u.role === 'teacher') {
        classSectionCell = escapeHtml(formatClassSection(u.className, u.section));
      } else {
        classSectionCell = u.className || u.section
          ? escapeHtml(formatClassSection(u.className, u.section))
          : '—';
      }
      html += `
        <tr data-name="${(u.name || '').toLowerCase()}" data-role="${u.role || ''}" data-class="${escapeHtml(dataClass)}">
          <td>${escapeHtml(u.name || 'N/A')}</td>
          <td>${escapeHtml(u.email || 'N/A')}</td>
          <td><span class="role-badge role-${u.role || 'unknown'}">${u.role || 'N/A'}</span></td>
          <td class="parent-class-cell">${classSectionCell}</td>
          <td class="actions">
            <button onclick="editUser('${u.id}')" class="btn btn-sm btn-secondary">
              <span class="btn-icon">✏️</span>
              Edit
            </button>
            <button onclick="deleteUser('${u.id}')" class="btn btn-sm btn-danger">
              <span class="btn-icon">🗑️</span>
              Delete
            </button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
    
    featureDiv.innerHTML = html;
    
    // Add user button functionality
    document.getElementById('add-user-btn').onclick = showAddUserForm;
    
    // Add filter functionality
    setupUserFilters();
    
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>User Management</h1>
        <p>Manage system users including teachers, parents, and drivers.</p>
      </div>
      <div class="error-message">Error loading users. Please try again.</div>
    `;
  }
}

function setupUserFilters() {
  const searchInput = document.getElementById('search-name');
  const roleFilter = document.getElementById('filter-role');
  const classFilter = document.getElementById('filter-class');
  const clearBtn = document.getElementById('clear-filters-btn');
  const filterCount = document.getElementById('filter-count');
  
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedRole = roleFilter.value;
    const selectedClass = classFilter.value;
    
    const rows = document.querySelectorAll('#users-tbody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
      const name = row.getAttribute('data-name') || '';
      const role = row.getAttribute('data-role') || '';
      const className = row.getAttribute('data-class') || '';
      
      const matchesSearch = !searchTerm || name.includes(searchTerm);
      const matchesRole = !selectedRole || role === selectedRole;
      const classKeys = className.split(',').map(s => s.trim()).filter(Boolean);
      const matchesClass = !selectedClass || classKeys.includes(selectedClass);

      if (matchesSearch && matchesRole && matchesClass) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });

    filterCount.textContent = `Showing ${visibleCount} users`;
  }

  searchInput.addEventListener('input', applyFilters);
  roleFilter.addEventListener('change', applyFilters);
  classFilter.addEventListener('change', applyFilters);

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    roleFilter.value = '';
    classFilter.value = '';
    applyFilters();
  });
}

async function showAddUserForm() {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading form...</div>';
  const classSelect = await buildClassSectionSelectHtml();

  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Add New User</h1>
      <p>Create a new user account with appropriate role and permissions.</p>
    </div>
    <div class="form-container">
      <form id="add-user-form" class="portal-form">
        <div class="form-grid">
          <div class="form-group"><label for="user-name">Full Name</label><input type="text" id="user-name" required placeholder="Full name"></div>
          <div class="form-group"><label for="user-email">Email</label><input type="email" id="user-email" required placeholder="email@school.com"></div>
          <div class="form-group"><label for="user-password">Password</label><input type="password" id="user-password" required minlength="6" placeholder="Min. 6 characters"></div>
          <div class="form-group"><label for="user-role">Role</label>
            <select id="user-role" required>
              <option value="">Select role</option>
              <option value="admin">Admin</option>
              <option value="teacher">Teacher</option>
              <option value="parent">Parent</option>
              <option value="driver">Driver</option>
            </select>
          </div>
          <div class="form-group teacher-fields" id="teacher-class-group" style="display:none;grid-column:1/-1">
            <label for="user-class-section">Assigned Class &amp; Section</label>
            <select id="user-class-section">${classSelect.html}</select>
          </div>
          <div class="form-group teacher-fields" id="subjects-group" style="display:none;grid-column:1/-1">
            <label for="user-subjects">Subjects</label>
            <input type="text" id="user-subjects" placeholder="Maths, Physics, Chemistry">
            <p class="form-hint">Comma-separated list of subjects this teacher handles.</p>
          </div>
          <div class="form-group parent-fields" id="parent-hint-group" style="display:none;grid-column:1/-1">
            <label>Children (Class / Section)</label>
            <p class="form-hint">After creating the parent, open <strong>Students</strong> and set each child's <em>Parent Email</em> to this parent's address. Class/section will appear here automatically.</p>
          </div>
          <div class="form-group driver-fields" id="driver-hint-group" style="display:none;grid-column:1/-1">
            <label>Bus assignment</label>
            <p class="form-hint">After creating the driver, open <strong>Buses &amp; Routes</strong> and assign this driver to a bus. Students are linked when their <em>Bus</em> field on the student record matches the bus number.</p>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Create User</button>
          <button type="button" class="btn btn-secondary" id="repair-user-btn">Repair profile for this email</button>
          <button type="button" class="btn btn-secondary" onclick="showUserManagement()">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('user-role').onchange = function() {
    const role = this.value;
    document.querySelectorAll('.teacher-fields').forEach(el => {
      el.style.display = role === 'teacher' ? '' : 'none';
    });
    const parentHint = document.getElementById('parent-hint-group');
    if (parentHint) parentHint.style.display = role === 'parent' ? '' : 'none';
    const driverHint = document.getElementById('driver-hint-group');
    if (driverHint) driverHint.style.display = role === 'driver' ? '' : 'none';
  };

  document.getElementById('repair-user-btn').onclick = async () => {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim().toLowerCase();
    const role = document.getElementById('user-role').value;
    if (!email || !role) {
      toast('Enter email and role first.', 'error');
      return;
    }
    try {
      const data = await adminApi('/api/admin/users/ensure-profile', 'POST', { name, email, role });
      toast(data.message || 'Profile repaired.', 'success');
      showUserManagement();
    } catch (error) {
      toast(error.message, 'error');
    }
  };
  
  // Form submission
  document.getElementById('add-user-form').onsubmit = async (e) => {
    e.preventDefault();
    
    const name = normalizeClassName(document.getElementById('user-name').value);
    const email = document.getElementById('user-email').value.trim().toLowerCase();
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;
    let className = '';
    let section = '';
    if (role === 'teacher') {
      const parsed = parseClassSectionSelect(document.getElementById('user-class-section').value);
      className = parsed.className;
      section = parsed.section;
    }
    const subjects = normalizeCsvList(document.getElementById('user-subjects').value);

    if (!name || !email || !role) {
      toast('Name, email, and role are required.', 'error');
      return;
    }
    if (role === 'teacher' && (!className || !section || !subjects)) {
      toast('Teachers need class, section, and at least one subject.', 'error');
      return;
    }
    
    try {
      await adminApi('/api/admin/users', 'POST', {
        name,
        email,
        password,
        role,
        className: className || '',
        section: section || '',
        subjects: subjects || '',
      });

      toast('User created successfully. They can log in from the login page.', 'success');
      showUserManagement();

    } catch (error) {
      toast('Error creating user: ' + error.message, 'error');
    }
  };
}

async function showStudentManagement(user) {
  setActiveNav('students');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Student Management</h1>
      <p>Manage student records, enrollment, and academic information.</p>
    </div>
    <div class="loading">Loading students...</div>
  `;
  
  try {
    const studentsSnap = await getDocs(collection(db, 'students'));
    const students = [];
    studentsSnap.forEach(doc => {
      students.push({ id: doc.id, ...doc.data() });
    });
    
    // Get unique classes and sections for filters
    const uniqueClasses = [...new Set(students.map(s => s.class).filter(Boolean))].sort();
    const uniqueSections = [...new Set(students.map(s => s.section).filter(Boolean))].sort();
    
    let html = `
      <div class="page-header">
        <h1>Student Management</h1>
        <p>Manage student records, enrollment, and academic information.</p>
      </div>
      
      <div class="section-header">
        <h2>All Students</h2>
        <button id="add-student-btn" class="btn btn-primary">
          <span class="btn-icon">🎓</span>
          Add New Student
        </button>
      </div>
      
      <div class="filters-section">
        <div class="filter-row">
          <div class="filter-group">
            <label for="search-name">Search by Name:</label>
            <input type="text" id="search-name" placeholder="Enter student name..." class="filter-input">
          </div>
          
          <div class="filter-group">
            <label for="filter-class">Filter by Class:</label>
            <select id="filter-class" class="filter-select">
              <option value="">All Classes</option>
              ${uniqueClasses.map(c => `<option value="${c}">Class ${c}</option>`).join('')}
            </select>
          </div>
          
          <div class="filter-group">
            <label for="filter-section">Filter by Section:</label>
            <select id="filter-section" class="filter-select">
              <option value="">All Sections</option>
              ${uniqueSections.map(s => `<option value="${s}">Section ${s}</option>`).join('')}
            </select>
          </div>
          
          <div class="filter-group">
            <button id="clear-filters-btn" class="btn btn-secondary">
              <span class="btn-icon">🔄</span>
              Clear Filters
            </button>
          </div>
        </div>
        
        <div class="filter-stats">
          <span id="filter-count">Showing ${students.length} students</span>
        </div>
      </div>
      
      <div class="table-container">
        <table class="data-table" id="students-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Class</th>
              <th>Section</th>
              <th>Parent Email</th>
              <th>Bus</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="students-tbody">
    `;
    
    students.forEach(s => {
      html += `
        <tr data-name="${(s.name || '').toLowerCase()}" data-class="${s.class || ''}" data-section="${s.section || ''}">
          <td>${s.name || 'N/A'}</td>
          <td>${s.class || 'N/A'}</td>
          <td>${s.section || 'N/A'}</td>
          <td>${s.parentEmail || 'N/A'}</td>
          <td>${s.bus || 'N/A'}</td>
          <td class="actions">
            <button onclick="editStudent('${s.id}')" class="btn btn-sm btn-secondary">
              <span class="btn-icon">✏️</span>
              Edit
            </button>
            <button onclick="deleteStudent('${s.id}')" class="btn btn-sm btn-danger">
              <span class="btn-icon">🗑️</span>
              Delete
            </button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
    
    featureDiv.innerHTML = html;
    
    // Add student button functionality
    document.getElementById('add-student-btn').onclick = showAddStudentForm;
    
    // Add filter functionality
    setupStudentFilters();
    
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Student Management</h1>
        <p>Manage student records, enrollment, and academic information.</p>
      </div>
      <div class="error-message">Error loading students. Please try again.</div>
    `;
  }
}

function setupStudentFilters() {
  const searchInput = document.getElementById('search-name');
  const classFilter = document.getElementById('filter-class');
  const sectionFilter = document.getElementById('filter-section');
  const clearBtn = document.getElementById('clear-filters-btn');
  const filterCount = document.getElementById('filter-count');
  
  function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase();
    const selectedClass = classFilter.value;
    const selectedSection = sectionFilter.value;
    
    const rows = document.querySelectorAll('#students-tbody tr');
    let visibleCount = 0;
    
    rows.forEach(row => {
      const name = row.getAttribute('data-name') || '';
      const className = row.getAttribute('data-class') || '';
      const section = row.getAttribute('data-section') || '';
      
      const matchesSearch = !searchTerm || name.includes(searchTerm);
      const matchesClass = !selectedClass || className === selectedClass;
      const matchesSection = !selectedSection || section === selectedSection;
      
      if (matchesSearch && matchesClass && matchesSection) {
        row.style.display = '';
        visibleCount++;
      } else {
        row.style.display = 'none';
      }
    });
    
    filterCount.textContent = `Showing ${visibleCount} students`;
  }
  
  // Add event listeners
  searchInput.addEventListener('input', applyFilters);
  classFilter.addEventListener('change', applyFilters);
  sectionFilter.addEventListener('change', applyFilters);
  
  // Clear filters
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    classFilter.value = '';
    sectionFilter.value = '';
    applyFilters();
  });
}

async function showAddStudentForm() {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading form...</div>';
  const classSelect = await buildClassSectionSelectHtml();

  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Add New Student</h1>
      <p>Create a new student record with enrollment details.</p>
    </div>
    <div class="form-container">
      <form id="add-student-form" class="portal-form">
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label for="student-name">Full Name</label>
            <input type="text" id="student-name" required placeholder="Enter student's full name">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label for="student-class-section">Class &amp; Section</label>
            <select id="student-class-section" required>${classSelect.html}</select>
            ${classSelect.hasClasses ? '' : '<p class="form-hint"><a href="#" id="goto-add-class">Create a class</a> before enrolling students.</p>'}
          </div>
          <div class="form-group">
            <label for="student-parent-email">Parent Email</label>
            <input type="email" id="student-parent-email" required placeholder="parent@example.com">
          </div>
          <div class="form-group">
            <label for="student-bus">Bus (optional)</label>
            <input type="text" id="student-bus" placeholder="e.g. Bus 12">
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add Student</button>
          <button type="button" class="btn btn-secondary" onclick="showStudentManagement()">Cancel</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('goto-add-class')?.addEventListener('click', (e) => {
    e.preventDefault();
    showClassManagement();
  });

  document.getElementById('add-student-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = normalizeClassName(document.getElementById('student-name').value);
    const { className, section } = parseClassSectionSelect(document.getElementById('student-class-section').value);
    const parentEmail = document.getElementById('student-parent-email').value.trim().toLowerCase();
    const bus = normalizeClassName(document.getElementById('student-bus').value);

    if (!name || !className || !section || !parentEmail) {
      toast('Name, class, section, and parent email are required.', 'error');
      return;
    }
    if (assertSingleSectionInput(section)) {
      toast('Select one class and one section for the student.', 'error');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      toast('Enter a valid parent email address.', 'error');
      return;
    }
    
    try {
      // Create student document in Firestore
      await setDoc(doc(db, 'students', Date.now().toString()), {
        name,
        class: className,
        section,
        parentEmail,
        bus: bus || '',
        createdAt: new Date().toISOString()
      });
      if (bus) await refreshBusStudentListsForNumber(bus);
      
      toast('Student added successfully.', 'success');
      showStudentManagement();
      
    } catch (error) {
      toast('Error adding student: ' + error.message, 'error');
    }
  };
}

async function showClassManagement(user) {
  setActiveNav('classes');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Class Management</h1>
      <p>Manage class structures, sections, and teacher assignments.</p>
    </div>
    <div class="loading">Loading classes...</div>
  `;
  
  try {
    const [classesSnap, teachersSnap] = await Promise.all([
      getDocs(collection(db, 'classes')),
      getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')))
    ]);
    const classes = [];
    classesSnap.forEach(doc => {
      classes.push({ id: doc.id, ...doc.data() });
    });
    const teacherMap = {};
    teachersSnap.forEach(teacherDoc => {
      const t = teacherDoc.data();
      teacherMap[teacherDoc.id] = t.name || t.email || teacherDoc.id;
    });
    
    let html = `
      <div class="page-header">
        <h1>Class Management</h1>
        <p>Manage class structures, sections, and teacher assignments.</p>
      </div>
      
      <div class="section-header">
        <h2>All Classes</h2>
        <button id="add-class-btn" class="btn btn-primary">
          <span class="btn-icon">🏫</span>
          Add New Class
        </button>
      </div>
      
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Class Name</th>
              <th>Section</th>
              <th>Teacher</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    classes.forEach(c => {
      const teacherLabel = c.teacherName || (c.teacherId ? (teacherMap[c.teacherId] || c.teacherId) : 'N/A');
      const multiSection = /[,;|]/.test(String(c.section || ''));
      const sectionDisplay = multiSection
        ? `<span class="text-warning" title="Split into one class per section">${escapeHtml(c.section)} ⚠</span>`
        : escapeHtml(c.section || 'N/A');
      html += `
        <tr>
          <td>${escapeHtml(c.name || 'N/A')}</td>
          <td>${sectionDisplay}</td>
          <td>${escapeHtml(teacherLabel)}</td>
          <td class="actions">
            <button onclick="editClass('${c.id}')" class="btn btn-sm btn-secondary">
              <span class="btn-icon">✏️</span>
              Edit
            </button>
            <button onclick="deleteClass('${c.id}')" class="btn btn-sm btn-danger">
              <span class="btn-icon">🗑️</span>
              Delete
            </button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
    
    featureDiv.innerHTML = html;
    
    // Add class button functionality
    document.getElementById('add-class-btn').onclick = showAddClassForm;
    
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Class Management</h1>
        <p>Manage class structures, sections, and teacher assignments.</p>
      </div>
      <div class="error-message">Error loading classes. Please try again.</div>
    `;
  }
}

async function showAddClassForm() {
  const featureDiv = document.getElementById('feature-content');
  const teachersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
  const teachers = [];
  teachersSnap.forEach(teacherDoc => {
    const t = teacherDoc.data();
    teachers.push({ id: teacherDoc.id, name: t.name || t.email || teacherDoc.id, email: t.email || '' });
  });
  const teacherOptions = teachers
    .map(t => `<option value="${t.id}">${t.name}${t.email ? ` (${t.email})` : ''}</option>`)
    .join('');

  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Add New Class</h1>
      <p>Create a new class with section and teacher assignment.</p>
    </div>
    
    <div class="form-container">
      <form id="add-class-form" class="portal-form">
        <div class="form-grid">
          <div class="form-group">
            <label for="class-name">Class Name</label>
            <input type="text" id="class-name" required placeholder="e.g. Class 10">
          </div>
          <div class="form-group">
            <label for="class-section">Section</label>
            <input type="text" id="class-section" required placeholder="e.g. A" maxlength="4" pattern="[A-Za-z0-9]+">
            <p class="form-hint">One section per class (e.g. A). Add another class row for section B.</p>
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label for="class-teacher-id">Class Teacher</label>
            <select id="class-teacher-id">
              <option value="">Not Assigned</option>
              ${teacherOptions}
            </select>
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn-primary">Add Class</button>
          <button type="button" class="btn btn-secondary" onclick="showClassManagement()">Cancel</button>
        </div>
      </form>
    </div>
  `;
  
  // Form submission
  document.getElementById('add-class-form').onsubmit = async (e) => {
    e.preventDefault();
    
    const name = normalizeClassName(document.getElementById('class-name').value);
    const sectionRaw = document.getElementById('class-section').value;
    const sectionErr = assertSingleSectionInput(sectionRaw);
    if (sectionErr) {
      toast(sectionErr, 'error');
      return;
    }
    const section = normalizeSection(sectionRaw);
    const teacherId = document.getElementById('class-teacher-id').value;
    const selectedTeacher = teachers.find(t => t.id === teacherId);

    if (!name || !section) {
      toast('Class name and section are required.', 'error');
      return;
    }

    try {
      await setDoc(doc(db, 'classes', classDocId(name, section)), {
        name,
        section,
        teacherId: teacherId || '',
        teacherName: selectedTeacher ? selectedTeacher.name : '',
        createdAt: new Date().toISOString()
      });
      
      toast('Class added successfully.', 'success');
      showClassManagement();
      
    } catch (error) {
      toast('Error adding class: ' + error.message, 'error');
    }
  };
}

async function showTimetableManagement() {
  setActiveNav('timetable');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Timetable Management</h1>
      <p>Create and manage class timetable entries.</p>
    </div>
    <div class="loading">Loading timetable data...</div>
  `;

  try {
    const [timetableSnap, classesSnap, teachersSnap] = await Promise.all([
      getDocs(collection(db, 'timetable')),
      getDocs(collection(db, 'classes')),
      getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')))
    ]);

    const timetableEntries = [];
    timetableSnap.forEach(entryDoc => timetableEntries.push({ id: entryDoc.id, ...entryDoc.data() }));
    timetableEntries.sort((a, b) => `${a.class || ''}${a.section || ''}${a.day || ''}${a.period || ''}`.localeCompare(`${b.class || ''}${b.section || ''}${b.day || ''}${b.period || ''}`));

    const classesList = [];
    classesSnap.forEach(classDoc => {
      classesList.push({ id: classDoc.id, ...classDoc.data() });
    });
    const classOptionHtml = listClassSectionOptions(classesList)
      .map(c => `<option value="${escapeHtml(c.value)}">${escapeHtml(c.label)}</option>`)
      .join('');

    const teacherOptions = [];
    teachersSnap.forEach(teacherDoc => {
      const t = teacherDoc.data();
      teacherOptions.push({ id: teacherDoc.id, name: t.name || t.email || teacherDoc.id });
    });
    const teacherOptionHtml = teacherOptions
      .map(t => `<option value="${t.id}">${t.name}</option>`)
      .join('');

    let tableRows = '';
    timetableEntries.forEach(entry => {
      tableRows += `
        <tr>
          <td>${entry.class || ''}</td>
          <td>${entry.section || ''}</td>
          <td>${entry.day || ''}</td>
          <td>${entry.period || ''}</td>
          <td>${entry.subject || ''}</td>
          <td>${entry.teacherName || ''}</td>
          <td>${entry.start || ''} - ${entry.end || ''}</td>
          <td class="actions">
            <button onclick="editTimetableEntry('${entry.id}')" class="btn btn-sm btn-secondary">Edit</button>
            <button onclick="deleteTimetableEntry('${entry.id}')" class="btn btn-sm btn-danger">Delete</button>
          </td>
        </tr>
      `;
    });

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Timetable Management</h1>
        <p>Create and manage class timetable entries.</p>
      </div>

      <div class="card">
        <h2 style="margin:0 0 1rem;font-size:1rem;">Add Timetable Entry</h2>
        <form id="add-timetable-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group">
              <label for="tt-class-section">Class & Section</label>
              <select id="tt-class-section" required>
                <option value="">Select class/section</option>
                ${classOptionHtml}
              </select>
            </div>
            <div class="form-group">
              <label for="tt-day">Day</label>
              <select id="tt-day" required>
                <option value="">Select day</option>
                ${DAYS.map(d => `<option>${d}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="tt-period">Period</label>
              <input type="number" id="tt-period" min="1" max="12" required placeholder="1">
            </div>
            <div class="form-group">
              <label for="tt-subject">Subject</label>
              <input type="text" id="tt-subject" required placeholder="Maths">
            </div>
            <div class="form-group">
              <label for="tt-teacher">Teacher</label>
              <select id="tt-teacher" required>
                <option value="">Select teacher</option>
                ${teacherOptionHtml}
              </select>
            </div>
            <div class="form-group">
              <label for="tt-start">Start</label>
              <input type="time" id="tt-start" required>
            </div>
            <div class="form-group">
              <label for="tt-end">End</label>
              <input type="time" id="tt-end" required>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save Entry</button>
          </div>
        </form>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Class</th><th>Section</th><th>Day</th><th>Period</th>
              <th>Subject</th><th>Teacher</th><th>Time</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>${tableRows || '<tr><td colspan="8">No timetable entries found.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    document.getElementById('add-timetable-form').onsubmit = async (e) => {
      e.preventDefault();
      const { className, section } = parseClassSectionSelect(document.getElementById('tt-class-section').value);
      const day = document.getElementById('tt-day').value;
      const period = Number(document.getElementById('tt-period').value);
      const subject = normalizeClassName(document.getElementById('tt-subject').value);
      const teacherId = document.getElementById('tt-teacher').value;
      const start = document.getElementById('tt-start').value;
      const end = document.getElementById('tt-end').value;
      const teacher = teacherOptions.find(t => t.id === teacherId);

      if (!className || !section || !day || !period || !subject || !teacherId || !start || !end) {
        toast('Please fill all timetable fields.', 'error');
        return;
      }
      if (assertSingleSectionInput(section)) {
        toast('Select one class and one section.', 'error');
        return;
      }
      if (start >= end) {
        toast('Start time must be earlier than end time.', 'error');
        return;
      }

      const entryId = `${className}_${section}_${day}_${period}`.replace(/\s+/g, '_');
      await setDoc(doc(db, 'timetable', entryId), {
        class: className,
        section,
        day,
        period,
        subject,
        teacherId,
        teacherName: teacher ? teacher.name : '',
        start,
        end,
        updatedAt: new Date().toISOString()
      });
      toast('Timetable entry saved.', 'success');
      showTimetableManagement();
    };
  } catch (error) {
    console.error(error);
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Timetable Management</h1>
        <p>Create and manage class timetable entries.</p>
      </div>
      <div class="error-message">Error loading timetable management.</div>
    `;
  }
}

async function showExamManagement() {
  setActiveNav('exams');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading exams...</div>';

  try {
    const examsSnap = await getDocs(collection(db, 'exams'));
    const exams = [];
    examsSnap.forEach(d => exams.push({ id: d.id, ...d.data() }));

    let rows = '';
    exams.forEach(ex => {
      const subjCount = (ex.subjects || []).length;
      rows += `<tr>
        <td>${escapeHtml(ex.name)}</td>
        <td>${escapeHtml(ex.class)} ${escapeHtml(ex.section)}</td>
        <td>${escapeHtml(ex.term || '-')}</td>
        <td>${escapeHtml(ex.date || '-')}</td>
        <td>${subjCount} subject(s)</td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" onclick="editExam('${ex.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteExam('${ex.id}')">Delete</button>
        </td>
      </tr>`;
    });

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Exam Management</h1>
        <p>Create exams and subjects for teacher marks entry.</p>
      </div>
      <div class="card">
        <h2 style="margin:0 0 1rem;font-size:1rem;">Add Exam</h2>
        <form id="add-exam-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Exam Name</label><input id="exam-name" required placeholder="Mid Term"></div>
            <div class="form-group"><label>Class</label><input id="exam-class" required placeholder="Class 10"></div>
            <div class="form-group"><label>Section</label><input id="exam-section" required placeholder="A"></div>
            <div class="form-group"><label>Term</label><input id="exam-term" placeholder="Term 1"></div>
            <div class="form-group"><label>Date</label><input type="date" id="exam-date" required></div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Subjects (name:max, comma-separated)</label>
              <input id="exam-subjects" required placeholder="Maths:100, Science:100, English:80">
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save Exam</button>
          </div>
        </form>
      </div>
      <div class="section-header"><h2>All Exams</h2></div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Name</th><th>Class</th><th>Term</th><th>Date</th><th>Subjects</th><th>Actions</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty-state">No exams yet. Add one above.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    document.getElementById('add-exam-form').onsubmit = async (e) => {
      e.preventDefault();
      const name = normalizeClassName(document.getElementById('exam-name').value);
      const className = normalizeClassName(document.getElementById('exam-class').value);
      const section = normalizeSection(document.getElementById('exam-section').value);
      const term = document.getElementById('exam-term').value.trim();
      const date = document.getElementById('exam-date').value;
      const subjectsRaw = document.getElementById('exam-subjects').value;
      const subjects = subjectsRaw.split(',').map(s => s.trim()).filter(Boolean).map(pair => {
        const [n, m] = pair.split(':');
        return { name: (n || '').trim(), max: Number((m || '100').trim()) || 100 };
      }).filter(s => s.name);
      if (!name || !className || !section || !date || !subjects.length) {
        toast('Fill all required fields and at least one subject.', 'error');
        return;
      }
      const id = `${className}_${section}_${name}_${date}`.replace(/\s+/g, '_');
      await setDoc(doc(db, 'exams', id), { name, class: className, section, term, date, subjects, updatedAt: new Date().toISOString() });
      toast('Exam saved.', 'success');
      showExamManagement();
    };
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<div class="error-message">Error loading exams.</div>';
  }
}

async function showNotificationManagement() {
  setActiveNav('notifications');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = renderNotificationsLoading('Notifications');

  try {
    const snap = await getDocs(collection(db, 'notifications'));
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => (b.time || 0) - (a.time || 0));

    const composeCard = `
      <div class="card notif-compose-card">
        <h2>Send notification</h2>
        <form id="add-notification-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Title</label><input id="notif-title" required placeholder="e.g. Holiday notice"></div>
            <div class="form-group"><label>Audience</label>
              <select id="notif-role" required>
                <option value="all">Everyone</option>
                <option value="teacher">Teachers</option>
                <option value="parent">Parents</option>
                <option value="driver">Drivers</option>
                <option value="admin">Admins</option>
              </select>
            </div>
            <div class="form-group"><label>Category</label>
              <select id="notif-category">
                <option value="general">General</option>
                <option value="attendance">Attendance</option>
                <option value="marks">Marks</option>
                <option value="bus">Bus</option>
                <option value="exam">Exam</option>
                <option value="urgent">Urgent</option>
                <option value="holiday">Holiday</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div class="form-group" style="grid-column:1/-1"><label>Message</label><textarea id="notif-message" rows="4" required placeholder="Write your announcement…"></textarea></div>
          </div>
          <div class="form-actions"><button type="submit" class="btn btn-primary">Send notification</button></div>
        </form>
      </div>
    `;

    const sentSection = items.length
      ? `<div class="notif-sent-section"><h2>Sent notifications</h2></div>`
      : '';

    featureDiv.innerHTML = renderNotificationsPage({
      pageTitle: 'Notifications',
      pageSubtitle: 'Broadcast messages to teachers, parents, drivers, or everyone.',
      notifications: items,
      emptyTitle: 'No messages sent yet',
      emptyMessage: 'Use the form above to send your first announcement.',
      showAudience: true,
      showDelete: true,
      deleteHandlerName: 'deleteNotification',
      extraHtml: composeCard + sentSection,
    });

    document.getElementById('add-notification-form').onsubmit = async (e) => {
      e.preventDefault();
      const title = document.getElementById('notif-title').value.trim();
      const role = document.getElementById('notif-role').value;
      const category = document.getElementById('notif-category').value || 'general';
      const message = document.getElementById('notif-message').value.trim();
      if (!title || !message) {
        toast('Title and message are required.', 'error');
        return;
      }
      await setDoc(doc(db, 'notifications', Date.now().toString()), {
        title, role, category, message, time: Date.now()
      });
      toast('Notification sent.', 'success');
      showNotificationManagement();
    };
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = renderNotificationsError(
      'Notifications',
      e.message || 'Error loading notifications.'
    );
  }
}

async function showBusManagement() {
  setActiveNav('buses');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading buses...</div>';

  try {
    const [busSnap, drivers] = await Promise.all([
      getDocs(collection(db, 'buses')),
      fetchDrivers(),
    ]);

    const buses = [];
    busSnap.forEach(d => buses.push({ id: d.id, ...d.data() }));
    buses.sort((a, b) => (a.number || '').localeCompare(b.number || ''));

    const driverById = Object.fromEntries(drivers.map(d => [d.id, d]));

    let rows = '';
    buses.forEach(b => {
      const driverLabel = b.driverName || (driverById[b.driverId]?.name) || '—';
      const studentCount = (b.students && b.students.length) || (b.studentIds && b.studentIds.length) || 0;
      rows += `<tr>
        <td>${escapeHtml(b.number || '—')}</td>
        <td>${escapeHtml(b.route || '—')}</td>
        <td>${escapeHtml(driverLabel)}</td>
        <td>${studentCount}</td>
        <td><span class="status-pill">${escapeHtml(b.status || 'Active')}</span></td>
        <td class="table-actions">
          <button type="button" class="btn btn-sm btn-secondary" data-bus-edit="${escapeHtml(b.id)}">Edit</button>
          <button type="button" class="btn btn-sm btn-danger" data-bus-delete="${escapeHtml(b.id)}">Delete</button>
        </td>
      </tr>`;
    });

    const driverOptions = drivers.length
      ? drivers.map(d =>
          `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.email)})</option>`
        ).join('')
      : '<option value="" disabled>No drivers — add one under Users</option>';

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Buses & Routes</h1>
        <p>Assign drivers and routes. Students are linked when their <em>Bus</em> field (on the student record) matches the bus number.</p>
      </div>
      <div class="card">
        <h2>Add bus</h2>
        <form id="add-bus-form" class="form-grid">
          <div class="form-group">
            <label for="bus-number">Bus number</label>
            <input type="text" id="bus-number" placeholder="e.g. Bus 1" required>
          </div>
          <div class="form-group">
            <label for="bus-route">Route name</label>
            <input type="text" id="bus-route" placeholder="e.g. North Route" required>
          </div>
          <div class="form-group">
            <label for="bus-driver">Driver</label>
            <select id="bus-driver" required>
              <option value="">Select driver…</option>
              ${driverOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="bus-capacity">Capacity</label>
            <input type="number" id="bus-capacity" min="1" max="100" value="40">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <button type="submit" class="btn btn-primary">Save bus</button>
          </div>
        </form>
      </div>
      <div class="table-container" style="margin-top:1.5rem">
        <table class="data-table">
          <thead><tr><th>Bus</th><th>Route</th><th>Driver</th><th>Students</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty-state">No buses yet. Add one above.</td></tr>'}</tbody>
        </table>
      </div>
    `;

    document.getElementById('add-bus-form').onsubmit = async (e) => {
      e.preventDefault();
      await saveBusForm(null);
    };

    featureDiv.querySelectorAll('[data-bus-edit]').forEach(btn => {
      btn.addEventListener('click', () => window.editBus(btn.getAttribute('data-bus-edit')));
    });
    featureDiv.querySelectorAll('[data-bus-delete]').forEach(btn => {
      btn.addEventListener('click', () => window.deleteBus(btn.getAttribute('data-bus-delete')));
    });
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<div class="error-message">Error loading buses.</div>';
  }
}

async function saveBusForm(editingId) {
  const numberEl = document.getElementById('bus-number');
  const routeEl = document.getElementById('bus-route');
  const driverEl = document.getElementById('bus-driver');
  const capacityEl = document.getElementById('bus-capacity');
  if (!numberEl || !routeEl || !driverEl) return;

  const number = numberEl.value.trim();
  const route = routeEl.value.trim();
  const driverId = driverEl.value;
  const capacity = parseInt(capacityEl?.value, 10) || 40;

  if (!number || !route || !driverId) {
    toast('Bus number, route, and driver are required.', 'error');
    return;
  }

  const drivers = await fetchDrivers();
  const driver = drivers.find(d => d.id === driverId);
  const { studentIds, students } = await studentsLinkedToBus(number);

  const busData = {
    number,
    route,
    driverId,
    driverName: driver ? driver.name : '',
    capacity,
    status: 'Active',
    studentIds,
    students,
    updatedAt: new Date().toISOString(),
  };

  const docId = editingId || busDocId(number);
  await setDoc(doc(db, 'buses', docId), busData, { merge: true });
  toast(editingId ? 'Bus updated.' : 'Bus added.', 'success');
  showBusManagement();
}

async function showAttendanceManagement() {
  setActiveNav('attendance');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading attendance...</div>';

  try {
    const [attSnap, studentsSnap] = await Promise.all([
      getDocs(collection(db, 'attendance')),
      getDocs(collection(db, 'students'))
    ]);
    const studentById = buildStudentLookup(studentsSnap);

    const records = [];
    attSnap.forEach(d => records.push({ id: d.id, ...d.data() }));
    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const today = new Date().toISOString().slice(0, 10);
    let todayP = 0, todayA = 0, todayL = 0;
    records.filter(r => r.date === today).forEach(r => {
      if (r.status === 'Present') todayP++;
      else if (r.status === 'Absent') todayA++;
      else if (r.status === 'Left for Home') todayL++;
    });

    let rows = '';
    records.slice(0, 100).forEach(r => {
      const studentLabel = resolveStudentDisplay(r, studentById);
      const classLabel = formatClassSection(r.class, r.section);
      const pill = statusPillClass(r.status);
      rows += `<tr>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(studentLabel)}</td>
        <td>${escapeHtml(classLabel)}</td>
        <td><span class="status-pill ${pill}">${escapeHtml(r.status || '—')}</span></td>
      </tr>`;
    });

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Attendance Overview</h1>
        <p>Monitor attendance records across all classes (latest 100).</p>
      </div>
      <div class="dashboard-stats">
        <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-content"><h3>Today Present</h3><div class="stat-number">${todayP}</div></div></div>
        <div class="stat-card"><div class="stat-icon">❌</div><div class="stat-content"><h3>Today Absent</h3><div class="stat-number">${todayA}</div></div></div>
        <div class="stat-card"><div class="stat-icon">🏠</div><div class="stat-content"><h3>Left Home</h3><div class="stat-number">${todayL}</div></div></div>
        <div class="stat-card"><div class="stat-icon">📋</div><div class="stat-content"><h3>Total Records</h3><div class="stat-number">${records.length}</div></div></div>
      </div>
      <div class="table-container">
        <table class="data-table">
          <thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Status</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="4" class="empty-state">No attendance records.</td></tr>'}</tbody>
        </table>
      </div>
    `;
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<div class="error-message">Error loading attendance.</div>';
  }
}

async function showReports(user) {
  setActiveNav('reports');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>Reports & Analytics</h1>
      <p>Generate comprehensive reports and analyze system data.</p>
    </div>
    
    <div class="reports-section">
      <div class="report-category">
        <h2>📊 Attendance Reports</h2>
        <div class="report-actions">
          <button onclick="generateAttendanceReport()" class="btn btn-primary">
            <span class="btn-icon">📈</span>
            Generate Attendance Report
          </button>
          <button onclick="generateStudentReport()" class="btn btn-primary">
            <span class="btn-icon">🎓</span>
            Generate Student Report
          </button>
        </div>
      </div>
      
      <div class="report-category">
        <h2>📋 System Reports</h2>
        <div class="report-actions">
          <button onclick="generateUserReport()" class="btn btn-primary">
            <span class="btn-icon">👥</span>
            Generate User Report
          </button>
          <button onclick="generateClassReport()" class="btn btn-primary">
            <span class="btn-icon">🏫</span>
            Generate Class Report
          </button>
        </div>
      </div>
      
      <div class="report-category">
        <h2>📅 Quick Reports</h2>
        <div class="report-actions">
          <button onclick="generateTodayReport()" class="btn btn-secondary">
            <span class="btn-icon">📅</span>
            Today's Summary
          </button>
          <button onclick="generateWeeklyReport()" class="btn btn-secondary">
            <span class="btn-icon">📊</span>
            Weekly Overview
          </button>
        </div>
      </div>
    </div>
  `;
}

async function showSettings(user) {
  setActiveNav('settings');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = `
    <div class="page-header">
      <h1>System Settings</h1>
      <p>Configure system preferences and view system information.</p>
    </div>
    
    <div class="settings-section">
      <div class="setting-category">
        <h2>📧 Email Configuration</h2>
        <div class="setting-info">
          <p>Email settings are configured in the backend Flask application.</p>
          <div class="setting-status">
            <span class="status-label">Status:</span>
            <span class="status-value success">✅ Configured</span>
          </div>
        </div>
      </div>
      
      <div class="setting-category">
        <h2>🔧 System Information</h2>
        <div class="system-info-grid">
          <div class="info-item">
            <span class="info-label">Firebase Project:</span>
            <span class="info-value">bioatt-attendance-25d06</span>
          </div>
          <div class="info-item">
            <span class="info-label">Current User:</span>
            <span class="info-value">${user.email}</span>
          </div>
          <div class="info-item">
            <span class="info-label">User Role:</span>
            <span class="info-value">Admin</span>
          </div>
          <div class="info-item">
            <span class="info-label">System Version:</span>
            <span class="info-value">1.0.0</span>
          </div>
        </div>
      </div>
      
      <div class="setting-category">
        <h2>⚙️ Quick Actions</h2>
        <div class="setting-actions">
          <button onclick="refreshSystem()" class="btn btn-secondary">
            <span class="btn-icon">🔄</span>
            Refresh System
          </button>
          <button onclick="exportSettings()" class="btn btn-secondary">
            <span class="btn-icon">📤</span>
            Export Settings
          </button>
        </div>
      </div>
    </div>
  `;
}

// Global functions for button actions
window.editUser = async function(userId) {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading user...</div>';
  try {
    const userSnap = await getDoc(doc(db, 'users', userId));
    if (!userSnap.exists()) {
      toast('User not found.', 'error');
      return showUserManagement();
    }
    const u = userSnap.data();
    const isTeacher = u.role === 'teacher';
    const isParent = u.role === 'parent';
    const firstClass = (u.className || '').split(',')[0]?.trim() || '';
    const firstSection = (u.section || '').split(',')[0]?.trim() || '';
    const classSelect = await buildClassSectionSelectHtml(firstClass, firstSection);
    let parentChildrenBlock = '';
    if (isParent) {
      const studentsSnap = await getDocs(collection(db, 'students'));
      const children = buildParentChildrenMap(studentsSnap)[normalizeEmailKey(u.email)] || [];
      parentChildrenBlock = renderParentChildrenEditor(children, u.email || '');
    }

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Edit User</h1>
        <p>Update profile for ${escapeHtml(u.email)}</p>
      </div>
      <div class="form-container">
        <form id="edit-user-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Name</label><input id="edit-user-name" value="${escapeHtml(u.name || '')}" required></div>
            <div class="form-group"><label>Email</label><input type="email" id="edit-user-email" value="${escapeHtml(u.email || '')}" required></div>
            <div class="form-group"><label>Role</label>
              <select id="edit-user-role" required>
                <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="teacher" ${u.role === 'teacher' ? 'selected' : ''}>Teacher</option>
                <option value="parent" ${u.role === 'parent' ? 'selected' : ''}>Parent</option>
                <option value="driver" ${u.role === 'driver' ? 'selected' : ''}>Driver</option>
              </select>
            </div>
            <div class="form-group teacher-fields" style="${isTeacher ? '' : 'display:none'};grid-column:1/-1">
              <label>Class &amp; Section</label>
              <select id="edit-user-class-section">${classSelect.html}</select>
            </div>
            <div class="form-group teacher-fields" style="${isTeacher ? '' : 'display:none'};grid-column:1/-1">
              <label>Subjects</label>
              <input id="edit-user-subjects" value="${escapeHtml(u.subjects || '')}" placeholder="Maths, Physics">
              <p class="form-hint">Comma-separated. For multiple classes, edit in Firebase or add separate teacher accounts.</p>
            </div>
            ${parentChildrenBlock}
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save Changes</button>
            <button type="button" class="btn btn-secondary" onclick="showUserManagement()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('edit-user-role').onchange = async function() {
      const role = this.value;
      document.querySelectorAll('.teacher-fields').forEach(el => {
        el.style.display = role === 'teacher' ? '' : 'none';
      });
      let parentBlock = document.querySelector('.parent-fields');
      if (role === 'parent' && !parentBlock) {
        const studentsSnap = await getDocs(collection(db, 'students'));
        const email = document.getElementById('edit-user-email').value.trim().toLowerCase();
        const children = buildParentChildrenMap(studentsSnap)[email] || [];
        const grid = document.querySelector('#edit-user-form .form-grid');
        grid.insertAdjacentHTML('beforeend', renderParentChildrenEditor(children, email));
      } else if (role !== 'parent') {
        document.querySelectorAll('.parent-fields').forEach(el => el.remove());
      }
    };
    document.getElementById('edit-user-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const role = document.getElementById('edit-user-role').value.trim().toLowerCase();
        const payload = {
          name: document.getElementById('edit-user-name').value.trim(),
          email: document.getElementById('edit-user-email').value.trim().toLowerCase(),
          role,
          updatedAt: new Date().toISOString()
        };
        if (role === 'teacher') {
          const { className, section } = parseClassSectionSelect(document.getElementById('edit-user-class-section').value);
          if (!className || !section) {
            toast('Select a class and section for the teacher.', 'error');
            return;
          }
          payload.className = className;
          payload.section = section;
          payload.subjects = normalizeCsvList(document.getElementById('edit-user-subjects').value);
        } else {
          payload.className = '';
          payload.section = '';
          payload.subjects = '';
        }
        await updateDocOrAdmin('users', userId, payload);
        toast('User updated.', 'success');
        showUserManagement();
      } catch (error) {
        console.error(error);
        toast('Could not save user: ' + error.message, 'error');
      }
    };
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.deleteUser = async function(userId) {
  if (!confirm('Delete this user profile?')) return;
  try {
    await deleteDocOrAdmin('users', userId);
    toast('User deleted.', 'success');
    showUserManagement();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.editStudent = async function(studentId) {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading student...</div>';
  try {
    const studentSnap = await getDoc(doc(db, 'students', studentId));
    if (!studentSnap.exists()) {
      toast('Student not found.', 'error');
      return showStudentManagement();
    }
    const s = studentSnap.data();
    const classSelect = await buildClassSectionSelectHtml(s.class, s.section);
    featureDiv.innerHTML = `
      <div class="page-header"><h1>Edit Student</h1><p>${escapeHtml(s.name)}</p></div>
      <div class="form-container">
        <form id="edit-student-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group" style="grid-column:1/-1"><label>Name</label><input id="edit-stu-name" value="${escapeHtml(s.name || '')}" required></div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Class &amp; Section</label>
              <select id="edit-stu-class-section" required>${classSelect.html}</select>
            </div>
            <div class="form-group"><label>Parent Email</label><input type="email" id="edit-stu-email" value="${escapeHtml(s.parentEmail || '')}" required></div>
            <div class="form-group"><label>Bus</label><input id="edit-stu-bus" value="${escapeHtml(s.bus || '')}"></div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-secondary" onclick="showStudentManagement()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('edit-student-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const { className, section } = parseClassSectionSelect(document.getElementById('edit-stu-class-section').value);
        const parentEmail = document.getElementById('edit-stu-email').value.trim().toLowerCase();
        if (assertSingleSectionInput(section)) {
          toast('Select one class and one section for the student.', 'error');
          return;
        }
        if (!className || !section) {
          toast('Select a class and section.', 'error');
          return;
        }
        const newBus = normalizeClassName(document.getElementById('edit-stu-bus').value);
        const oldBus = (s.bus || '').trim();
        await updateDocOrAdmin('students', studentId, {
          name: normalizeClassName(document.getElementById('edit-stu-name').value),
          class: className,
          section,
          parentEmail,
          bus: newBus,
          updatedAt: new Date().toISOString()
        });
        if (newBus) await refreshBusStudentListsForNumber(newBus);
        if (oldBus && oldBus !== newBus) await refreshBusStudentListsForNumber(oldBus);
        toast('Student updated.', 'success');
        showStudentManagement();
      } catch (error) {
        toast('Could not save student: ' + error.message, 'error');
      }
    };
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.deleteStudent = async function(studentId) {
  if (!confirm('Delete this student?')) return;
  try {
    await deleteDocOrAdmin('students', studentId);
    toast('Student deleted.', 'success');
    showStudentManagement();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.editClass = async function(classId) {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading class...</div>';
  try {
    const [classSnap, teachers] = await Promise.all([
      getDoc(doc(db, 'classes', classId)),
      fetchTeachers()
    ]);
    if (!classSnap.exists()) {
      toast('Class not found.', 'error');
      return showClassManagement();
    }
    const c = classSnap.data();
    const teacherOptions = teachers.map(t =>
      `<option value="${t.id}" ${t.id === c.teacherId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
    ).join('');
    featureDiv.innerHTML = `
      <div class="page-header"><h1>Edit Class</h1></div>
      <div class="form-container">
        <form id="edit-class-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Class Name</label><input id="edit-cls-name" value="${escapeHtml(c.name || '')}" required></div>
            <div class="form-group"><label>Section</label><input id="edit-cls-section" value="${escapeHtml(parseSectionList(c.section)[0] || c.section || '')}" required maxlength="4">
              <p class="form-hint">One section only. If this row had multiple sections, split into separate class records.</p>
            </div>
            <div class="form-group"><label>Class Teacher</label>
              <select id="edit-cls-teacher"><option value="">Not Assigned</option>${teacherOptions}</select>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-secondary" onclick="showClassManagement()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('edit-class-form').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const teacherId = document.getElementById('edit-cls-teacher').value;
        const teacher = teachers.find(t => t.id === teacherId);
        const sectionErr = assertSingleSectionInput(document.getElementById('edit-cls-section').value);
        if (sectionErr) {
          toast(sectionErr, 'error');
          return;
        }
        await updateDocOrAdmin('classes', classId, {
          name: normalizeClassName(document.getElementById('edit-cls-name').value),
          section: normalizeSection(document.getElementById('edit-cls-section').value),
          teacherId: teacherId || '',
          teacherName: teacher ? teacher.name : '',
          updatedAt: new Date().toISOString()
        });
        toast('Class updated.', 'success');
        showClassManagement();
      } catch (error) {
        toast('Could not save class: ' + error.message, 'error');
      }
    };
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.editExam = async function(examId) {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading exam...</div>';
  try {
    const snap = await getDoc(doc(db, 'exams', examId));
    if (!snap.exists()) {
      toast('Exam not found.', 'error');
      return showExamManagement();
    }
    const ex = snap.data();
    const subjectsStr = (ex.subjects || []).map(s => `${s.name}:${s.max}`).join(', ');
    featureDiv.innerHTML = `
      <div class="page-header"><h1>Edit Exam</h1><p>${escapeHtml(ex.name)}</p></div>
      <div class="form-container">
        <form id="edit-exam-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Exam Name</label><input id="edit-exam-name" value="${escapeHtml(ex.name || '')}" required></div>
            <div class="form-group"><label>Class</label><input id="edit-exam-class" value="${escapeHtml(ex.class || '')}" required></div>
            <div class="form-group"><label>Section</label><input id="edit-exam-section" value="${escapeHtml(ex.section || '')}" required></div>
            <div class="form-group"><label>Term</label><input id="edit-exam-term" value="${escapeHtml(ex.term || '')}"></div>
            <div class="form-group"><label>Date</label><input type="date" id="edit-exam-date" value="${escapeHtml(ex.date || '')}" required></div>
            <div class="form-group" style="grid-column:1/-1">
              <label>Subjects (name:max, comma-separated)</label>
              <input id="edit-exam-subjects" value="${escapeHtml(subjectsStr)}" required>
            </div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-secondary" onclick="showExamManagement()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('edit-exam-form').onsubmit = async (e) => {
      e.preventDefault();
      const subjectsRaw = document.getElementById('edit-exam-subjects').value;
      const parsed = subjectsRaw.split(',').map(s => s.trim()).filter(Boolean).map(pair => {
        const [n, m] = pair.split(':');
        return { name: (n || '').trim(), max: Number((m || '100').trim()) || 100 };
      }).filter(s => s.name);
      await updateDoc(doc(db, 'exams', examId), {
        name: normalizeClassName(document.getElementById('edit-exam-name').value),
        class: normalizeClassName(document.getElementById('edit-exam-class').value),
        section: normalizeSection(document.getElementById('edit-exam-section').value),
        term: document.getElementById('edit-exam-term').value.trim(),
        date: document.getElementById('edit-exam-date').value,
        subjects: parsed,
        updatedAt: new Date().toISOString()
      });
      toast('Exam updated.', 'success');
      showExamManagement();
    };
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.editTimetableEntry = async function(entryId) {
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading entry...</div>';
  try {
    const [entrySnap, teachers] = await Promise.all([
      getDoc(doc(db, 'timetable', entryId)),
      fetchTeachers()
    ]);
    if (!entrySnap.exists()) {
      toast('Entry not found.', 'error');
      return showTimetableManagement();
    }
    const e = entrySnap.data();
    const teacherOptions = teachers.map(t =>
      `<option value="${t.id}" ${t.id === e.teacherId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`
    ).join('');
    const dayOptions = DAYS.map(d => `<option ${d === e.day ? 'selected' : ''}>${d}</option>`).join('');
    featureDiv.innerHTML = `
      <div class="page-header"><h1>Edit Timetable</h1><p>${escapeHtml(e.class)} ${escapeHtml(e.section)} — Period ${e.period}</p></div>
      <div class="form-container">
        <form id="edit-tt-form" class="portal-form">
          <div class="form-grid">
            <div class="form-group"><label>Class</label><input id="edit-tt-class" value="${escapeHtml(e.class || '')}" required></div>
            <div class="form-group"><label>Section</label><input id="edit-tt-section" value="${escapeHtml(e.section || '')}" required></div>
            <div class="form-group"><label>Day</label><select id="edit-tt-day" required>${dayOptions}</select></div>
            <div class="form-group"><label>Period</label><input type="number" id="edit-tt-period" min="1" max="12" value="${e.period || 1}" required></div>
            <div class="form-group"><label>Subject</label><input id="edit-tt-subject" value="${escapeHtml(e.subject || '')}" required></div>
            <div class="form-group"><label>Teacher</label><select id="edit-tt-teacher" required><option value="">Select</option>${teacherOptions}</select></div>
            <div class="form-group"><label>Start</label><input type="time" id="edit-tt-start" value="${escapeHtml(e.start || '')}" required></div>
            <div class="form-group"><label>End</label><input type="time" id="edit-tt-end" value="${escapeHtml(e.end || '')}" required></div>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn-primary">Save</button>
            <button type="button" class="btn btn-secondary" onclick="showTimetableManagement()">Cancel</button>
          </div>
        </form>
      </div>
    `;
    document.getElementById('edit-tt-form').onsubmit = async (ev) => {
      ev.preventDefault();
      const className = normalizeClassName(document.getElementById('edit-tt-class').value);
      const sectionErr = assertSingleSectionInput(document.getElementById('edit-tt-section').value);
      if (sectionErr) {
        toast(sectionErr, 'error');
        return;
      }
      const section = normalizeSection(document.getElementById('edit-tt-section').value);
      const day = document.getElementById('edit-tt-day').value;
      const period = Number(document.getElementById('edit-tt-period').value);
      const subject = normalizeClassName(document.getElementById('edit-tt-subject').value);
      const teacherId = document.getElementById('edit-tt-teacher').value;
      const start = document.getElementById('edit-tt-start').value;
      const end = document.getElementById('edit-tt-end').value;
      const teacher = teachers.find(t => t.id === teacherId);
      if (start >= end) {
        toast('Start time must be earlier than end time.', 'error');
        return;
      }
      const newId = `${className}_${section}_${day}_${period}`.replace(/\s+/g, '_');
      const payload = {
        class: className, section, day, period, subject,
        teacherId, teacherName: teacher ? teacher.name : '',
        start, end, updatedAt: new Date().toISOString()
      };
      if (newId !== entryId) {
        await deleteDoc(doc(db, 'timetable', entryId));
        await setDoc(doc(db, 'timetable', newId), payload);
      } else {
        await updateDoc(doc(db, 'timetable', entryId), payload);
      }
      toast('Timetable updated.', 'success');
      showTimetableManagement();
    };
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.deleteExam = async function(examId) {
  if (!confirm('Delete this exam?')) return;
  await deleteDoc(doc(db, 'exams', examId));
  toast('Exam deleted.', 'success');
  showExamManagement();
};

window.deleteNotification = async function(notifId) {
  if (!confirm('Delete this notification?')) return;
  await deleteDoc(doc(db, 'notifications', notifId));
  toast('Notification deleted.', 'success');
  showNotificationManagement();
};

window.editBus = async function(busId) {
  setActiveNav('buses');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<div class="loading">Loading bus...</div>';
  try {
    const [busDoc, drivers] = await Promise.all([
      getDoc(doc(db, 'buses', busId)),
      fetchDrivers(),
    ]);
    if (!busDoc.exists()) {
      toast('Bus not found.', 'error');
      showBusManagement();
      return;
    }
    const bus = busDoc.data();
    const driverOptions = drivers.map(d => {
      const selected = d.id === bus.driverId ? ' selected' : '';
      return `<option value="${escapeHtml(d.id)}"${selected}>${escapeHtml(d.name)} (${escapeHtml(d.email)})</option>`;
    }).join('');

    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Edit bus</h1>
        <p>Update route, driver, or bus number. Student list refreshes from student records on save.</p>
      </div>
      <div class="card">
        <form id="edit-bus-form" class="form-grid">
          <div class="form-group">
            <label for="bus-number">Bus number</label>
            <input type="text" id="bus-number" value="${escapeHtml(bus.number || '')}" required>
          </div>
          <div class="form-group">
            <label for="bus-route">Route name</label>
            <input type="text" id="bus-route" value="${escapeHtml(bus.route || '')}" required>
          </div>
          <div class="form-group">
            <label for="bus-driver">Driver</label>
            <select id="bus-driver" required>
              <option value="">Select driver…</option>
              ${driverOptions}
            </select>
          </div>
          <div class="form-group">
            <label for="bus-capacity">Capacity</label>
            <input type="number" id="bus-capacity" min="1" max="100" value="${bus.capacity || 40}">
          </div>
          <div class="form-group" style="grid-column:1/-1;display:flex;gap:0.75rem;flex-wrap:wrap">
            <button type="submit" class="btn btn-primary">Save changes</button>
            <button type="button" class="btn btn-secondary" id="cancel-edit-bus">Cancel</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('edit-bus-form').onsubmit = async (e) => {
      e.preventDefault();
      await saveBusForm(busId);
    };
    document.getElementById('cancel-edit-bus').onclick = () => showBusManagement();
  } catch (e) {
    console.error(e);
    toast('Error loading bus.', 'error');
    showBusManagement();
  }
};

window.deleteBus = async function(busId) {
  if (!confirm('Delete this bus? The assigned driver will see "No bus assigned" until you create a new one.')) return;
  try {
    await deleteDocOrAdmin('buses', busId);
    toast('Bus deleted.', 'success');
    showBusManagement();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  }
};

window.deleteTimetableEntry = async function(entryId) {
  if (!confirm('Delete this timetable entry?')) return;
  try {
    await deleteDoc(doc(db, 'timetable', entryId));
    toast('Timetable entry deleted.', 'success');
    showTimetableManagement();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

window.deleteClass = async function(classId) {
  if (!confirm('Delete this class?')) return;
  try {
    await deleteDocOrAdmin('classes', classId);
    toast('Class deleted.', 'success');
    showClassManagement();
  } catch (error) {
    toast('Error: ' + error.message, 'error');
  }
};

function downloadCsv(filename, headers, rows) {
  const safeCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(safeCell).join(','), ...rows.map(r => r.map(safeCell).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

window.generateAttendanceReport = async function() {
  const snap = await getDocs(collection(db, 'attendance'));
  const rows = [];
  snap.forEach(d => {
    const a = d.data();
    rows.push([a.date, a.class, a.section, a.studentId, a.status, a.teacherId]);
  });
  downloadCsv('attendance_report.csv', ['Date', 'Class', 'Section', 'Student ID', 'Status', 'Teacher ID'], rows);
  toast('Attendance report downloaded.', 'success');
};

window.generateStudentReport = async function() {
  const snap = await getDocs(collection(db, 'students'));
  const rows = [];
  snap.forEach(d => {
    const s = d.data();
    rows.push([s.name, s.class, s.section, s.parentEmail, s.bus]);
  });
  downloadCsv('students_report.csv', ['Name', 'Class', 'Section', 'Parent Email', 'Bus'], rows);
  toast('Student report downloaded.', 'success');
};

window.generateUserReport = async function() {
  const snap = await getDocs(collection(db, 'users'));
  const rows = [];
  snap.forEach(d => {
    const u = d.data();
    rows.push([u.name, u.email, u.role, u.className, u.section, u.subjects]);
  });
  downloadCsv('users_report.csv', ['Name', 'Email', 'Role', 'Class', 'Section', 'Subjects'], rows);
  toast('User report downloaded.', 'success');
};

window.generateClassReport = async function() {
  const snap = await getDocs(collection(db, 'classes'));
  const rows = [];
  snap.forEach(d => {
    const c = d.data();
    rows.push([c.name, c.section, c.teacherName, c.teacherId]);
  });
  downloadCsv('classes_report.csv', ['Class', 'Section', 'Teacher', 'Teacher ID'], rows);
  toast('Class report downloaded.', 'success');
};

window.generateTodayReport = async function() {
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getDocs(query(collection(db, 'attendance'), where('date', '==', today)));
  let present = 0;
  let absent = 0;
  let left = 0;
  snap.forEach(d => {
    const status = d.data().status;
    if (status === 'Present') present++;
    else if (status === 'Absent') absent++;
    else if (status === 'Left for Home') left++;
  });
  toast(`Today: ${present} present, ${absent} absent, ${left} left for home`, 'info');
};

window.generateWeeklyReport = async function() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const snap = await getDocs(collection(db, 'attendance'));
  const dayStats = {};
  snap.forEach(d => {
    const a = d.data();
    if (!a.date || a.date < startStr || a.date > endStr) return;
    if (!dayStats[a.date]) dayStats[a.date] = { present: 0, absent: 0, left: 0 };
    if (a.status === 'Present') dayStats[a.date].present++;
    else if (a.status === 'Absent') dayStats[a.date].absent++;
    else if (a.status === 'Left for Home') dayStats[a.date].left++;
  });
  const rows = Object.entries(dayStats).sort(([a], [b]) => a.localeCompare(b)).map(([date, s]) => [date, s.present, s.absent, s.left]);
  downloadCsv('weekly_attendance_report.csv', ['Date', 'Present', 'Absent', 'Left for Home'], rows);
  toast('Weekly report downloaded.', 'success');
};

window.refreshSystem = function() {
  window.location.reload();
};

window.exportSettings = async function() {
  const usersSnap = await getDocs(collection(db, 'users'));
  const classesSnap = await getDocs(collection(db, 'classes'));
  const payload = {
    exportedAt: new Date().toISOString(),
    usersCount: usersSnap.size,
    classesCount: classesSnap.size
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'system_settings_export.json';
  a.click();
  URL.revokeObjectURL(url);
};

async function handleLogout() {
  console.log('Logout initiated...');
  
  // Get logout button elements
  const logoutBtn = document.getElementById('logout-btn');
  const logoutText = logoutBtn?.querySelector('.logout-text');
  const logoutLoading = logoutBtn?.querySelector('.logout-loading');
  
  // Show loading state
  if (logoutBtn) {
    logoutBtn.disabled = true;
    if (logoutText) logoutText.style.display = 'none';
    if (logoutLoading) logoutLoading.style.display = 'inline';
  }
  
  try {
    console.log('Calling Firebase logout...');
    await logout();
    console.log('Firebase logout successful');
    
    // Clear any local data
    localStorage.clear();
    sessionStorage.clear();
    console.log('Local storage cleared');
    
    // Redirect to login page
    console.log('Redirecting to login page...');
    window.location.href = '../common/login.html';
  } catch (error) {
    console.error('Logout error:', error);
    // Fallback: clear local storage and redirect anyway
    localStorage.clear();
    sessionStorage.clear();
    console.log('Fallback: redirecting to login page...');
    window.location.href = '../common/login.html';
  }
}

// Expose handlers for inline onclick and module scope
window.handleLogout = handleLogout;
window.showDashboard = showDashboard;
window.showUserManagement = showUserManagement;
window.showStudentManagement = showStudentManagement;
window.showClassManagement = showClassManagement;
window.showTimetableManagement = showTimetableManagement;
window.showExamManagement = showExamManagement;
window.showNotificationManagement = showNotificationManagement;
window.showBusManagement = showBusManagement;
window.showAttendanceManagement = showAttendanceManagement;
window.showReports = showReports;
window.showSettings = showSettings;

function renderPortal(user) {
  if (user) {
    renderDashboard(user);
  } else {
    window.location.href = '../common/login.html';
  }
}

onAuthChange(renderPortal, 'admin');
