import '../common/auth.js';
import { onAuthChange, logout } from '../common/auth.js';
import { getFirestore, collection, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from '../common/firebase-init.js';
import { getApiBase } from '../common/config.js';
import {
  renderNotificationsPage,
  renderNotificationsLoading,
  renderNotificationsError,
} from '../common/notifications-ui.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const db = getFirestore(app);
const auth = getAuth(app);

function parentEmailKey(email) {
  return (email || '').trim().toLowerCase();
}

async function parentApi(path) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

async function fetchMyStudents(user) {
  const email = parentEmailKey(user.email);
  for (const qEmail of [email, (user.email || '').trim()]) {
    if (!qEmail) continue;
    try {
      const snap = await getDocs(
        query(collection(db, 'students'), where('parentEmail', '==', qEmail))
      );
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (error) {
      console.warn(`Students query failed for ${qEmail}:`, error);
      if (!shouldUseApiFallback(error)) throw error;
    }
  }
  const data = await parentApi(`${getApiBase()}/api/parent/students`);
  return data.students || [];
}

function shouldUseApiFallback(error) {
  const msg = (error && error.message) || '';
  return msg.includes('index') || msg.includes('permission') || msg.includes('insufficient');
}

async function fetchStudentAttendance(studentId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'attendance'), where('studentId', '==', studentId))
    );
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  } catch (error) {
    console.warn('Attendance query failed:', error);
    if (!shouldUseApiFallback(error)) throw error;
  }
  const data = await parentApi(
    `${getApiBase()}/api/parent/attendance?studentId=${encodeURIComponent(studentId)}`
  );
  const rows = data.records || [];
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows;
}

async function fetchStudentMarks(studentId) {
  try {
    const snap = await getDocs(
      query(collection(db, 'marks'), where('studentId', '==', studentId))
    );
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return rows;
  } catch (error) {
    console.warn('Marks query failed:', error);
    if (!shouldUseApiFallback(error)) throw error;
  }
  const data = await parentApi(
    `${getApiBase()}/api/parent/marks?studentId=${encodeURIComponent(studentId)}`
  );
  const rows = data.records || [];
  rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return rows;
}

async function fetchParentNotifications() {
  try {
    const roles = ['parent', 'all'];
    const items = [];
    const seen = new Set();
    for (const role of roles) {
      const snap = await getDocs(
        query(collection(db, 'notifications'), where('role', '==', role))
      );
      snap.forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        items.push({ id: d.id, ...d.data() });
      });
    }
    items.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
    return items;
  } catch (error) {
    console.warn('Notifications query failed:', error);
  }
  const data = await parentApi(`${getApiBase()}/api/parent/notifications`);
  return data.notifications || [];
}

function asFirestoreDocs(rows) {
  return rows.map(r => ({
    id: r.id,
    data: () => r,
  }));
}
const appDiv = document.getElementById('app');

let currentSection = 'overview';
let currentStudent = null;

function renderDashboard(user) {
  appDiv.innerHTML = `
    <div class="portal-layout">
      <header class="portal-header">
        <div class="header-left">
          <h1 class="portal-title">BioAtt School</h1>
          <div class="brand-sub">Parent Portal</div>
        </div>
        <div class="header-right">
          <span class="user-info">${user.email}</span>
          <button class="logout-btn" id="logout-btn" type="button">Logout</button>
        </div>
      </header>
      <div class="portal-main">
        <nav class="portal-sidebar">
          <button class="nav-btn" id="nav-overview" type="button"><span class="nav-icon">🏠</span> Overview</button>
          <button class="nav-btn" id="nav-attendance" type="button"><span class="nav-icon">✅</span> Attendance</button>
          <button class="nav-btn" id="nav-marks" type="button"><span class="nav-icon">📝</span> Marks</button>
          <button class="nav-btn" id="nav-bus" type="button"><span class="nav-icon">🚌</span> Bus</button>
          <button class="nav-btn" id="nav-notifications" type="button"><span class="nav-icon">🔔</span> Notifications</button>
        </nav>
        <main class="portal-content">
          <div id="feature-content"></div>
        </main>
      </div>
    </div>
  `;
  
  document.getElementById('logout-btn').onclick = () => {
    logout();
    window.location.href = '../common/login.html';
  };
  
  const navs = [
    { id: 'nav-overview', section: 'overview', fn: showOverview },
    { id: 'nav-attendance', section: 'attendance', fn: showAttendance },
    { id: 'nav-marks', section: 'marks', fn: showMarks },
    { id: 'nav-bus', section: 'bus', fn: showBusTracking },
    { id: 'nav-notifications', section: 'notifications', fn: showNotifications },
  ];
  
  navs.forEach(({ id, section, fn }) => {
    document.getElementById(id).onclick = () => {
      setActiveNav(section);
      fn(user);
    };
  });
  
  setActiveNav(currentSection);
  showOverview(user);
}

function setActiveNav(section) {
  currentSection = section;
  [
    'nav-overview',
    'nav-attendance',
    'nav-marks',
    'nav-bus',
    'nav-notifications',
  ].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', id === `nav-${section}`);
  });
}

async function showOverview(user) {
  setActiveNav('overview');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>Student Overview</h2><div class="loading">Loading...</div>';
  
  try {
    const students = await fetchMyStudents(user);

    if (!students.length) {
      featureDiv.innerHTML = `
        <h2>Student Overview</h2>
        <div class="empty">
          <p>No students found for <strong>${user.email}</strong>.</p>
          <p>Demo parent login: <strong>emily.davis@demo.com</strong> (not david) / password <strong>1234567890</strong></p>
          <p>Ask admin to set your child's <em>parent email</em> to match your login exactly.</p>
        </div>
      `;
      return;
    }

    currentStudent = students[0];

    const attendanceRows = await fetchStudentAttendance(currentStudent.id);
    const marksRows = await fetchStudentMarks(currentStudent.id);
    const attendanceSnap = { docs: asFirestoreDocs(attendanceRows) };
    const marksSnap = { docs: asFirestoreDocs(marksRows) };

    let totalDays = 0, presentDays = 0, absentDays = 0;
    attendanceSnap.docs.forEach(doc => {
      const a = doc.data();
      totalDays++;
      if (a.status === 'Present') presentDays++;
      else if (a.status === 'Absent') absentDays++;
    });
    
    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;
    
    let totalMarks = 0, marksCount = 0;
    marksSnap.docs.forEach(doc => {
      const m = doc.data();
      if (m.marks !== undefined) {
        totalMarks += m.marks;
        marksCount++;
      }
    });
    
    const averageMarks = marksCount > 0 ? Math.round(totalMarks / marksCount) : 0;
    
    featureDiv.innerHTML = `
      <h2>Student Overview</h2>
      <div class="student-info">
        <h3>${currentStudent.name}</h3>
        <p><strong>Class:</strong> ${currentStudent.class} - Section ${currentStudent.section}</p>
        <p><strong>Bus:</strong> ${currentStudent.bus || 'Not assigned'}</p>
      </div>
      
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Attendance Rate</h3>
          <div class="stat-number">${attendanceRate}%</div>
          <div class="stat-detail">${presentDays} Present, ${absentDays} Absent</div>
        </div>
        <div class="stat-card">
          <h3>Average Marks</h3>
          <div class="stat-number">${averageMarks}</div>
          <div class="stat-detail">Based on ${marksCount} subjects</div>
        </div>
      </div>
      
      <div class="recent-activity">
        <h3>Recent Activity</h3>
        <div class="activity-list">
          ${attendanceSnap.docs.slice(0, 5).map(doc => {
            const a = doc.data();
            const status = a.status === 'Present' ? '✅ Present' : a.status === 'Absent' ? '❌ Absent' : '🏠 Left for Home';
            return `<div class="activity-item">
              <span class="activity-date">${a.date}</span>
              <span class="activity-status">${status}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    
  } catch (e) {
    console.error(e);
    const hint = (e.message || '').includes('index')
      ? ' Hard-refresh the page (Ctrl+F5) after Render deploy, or create the Firestore index from the console link in DevTools.'
      : '';
    featureDiv.innerHTML = `<h2>Student Overview</h2><div class="error">Error loading student data: ${e.message || e}.${hint}</div>`;
  }
}

async function showAttendance(user) {
  setActiveNav('attendance');
  const featureDiv = document.getElementById('feature-content');
  
  if (!currentStudent) {
    featureDiv.innerHTML = '<h2>Attendance</h2><div class="error">Please go to Overview first to load student data.</div>';
    return;
  }
  
  featureDiv.innerHTML = '<h2>Attendance Records</h2><div class="loading">Loading...</div>';
  
  try {
    const attendanceRows = await fetchStudentAttendance(currentStudent.id);
    const attendanceSnap = { docs: asFirestoreDocs(attendanceRows), empty: !attendanceRows.length };

    if (attendanceSnap.empty) {
      featureDiv.innerHTML = '<h2>Attendance Records</h2><div class="empty">No attendance records found.</div>';
      return;
    }
    
    let html = `
      <h2>Attendance Records - ${currentStudent.name}</h2>
      <div class="attendance-filters">
        <label>Month: </label>
        <select id="month-filter">
          <option value="">All Months</option>
          ${getMonthOptions()}
        </select>
        <button onclick="exportAttendanceCSV()" class="export-btn">Export CSV</button>
      </div>
      <div class="attendance-table-container">
        <table class="styled-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Present Time</th>
              <th>Left Time</th>
              <th>Class</th>
              <th>Section</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    attendanceSnap.docs.forEach(doc => {
      const a = doc.data();
      const status = a.status === 'Present' ? '✅ Present' : a.status === 'Absent' ? '❌ Absent' : '🏠 Left for Home';
      const presentTime = a.presentTime ? new Date(a.presentTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';
      const leftTime = a.leftTime ? new Date(a.leftTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-';

      html += `
        <tr>
          <td>${a.date}</td>
          <td>${status}</td>
          <td>${presentTime}</td>
          <td>${leftTime}</td>
          <td>${a.class || currentStudent.class}</td>
          <td>${a.section || currentStudent.section}</td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
      
      <div class="attendance-summary">
        <h3>Attendance Summary</h3>
        <div id="attendance-chart-container">
          <canvas id="attendance-chart" width="400" height="200"></canvas>
        </div>
      </div>
    `;
    
    featureDiv.innerHTML = html;
    
    // Set up month filter
    document.getElementById('month-filter').onchange = filterAttendanceByMonth;
    
    // Render attendance chart
    renderAttendanceChart(attendanceSnap.docs);
    
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<h2>Attendance Records</h2><div class="error">Error loading attendance data.</div>';
  }
}

async function showMarks(user) {
  setActiveNav('marks');
  const featureDiv = document.getElementById('feature-content');
  
  if (!currentStudent) {
    featureDiv.innerHTML = '<h2>Marks & Grades</h2><div class="error">Please go to Overview first to load student data.</div>';
    return;
  }
  
  featureDiv.innerHTML = '<h2>Marks & Grades</h2><div class="loading">Loading...</div>';
  
  try {
    const marksRows = await fetchStudentMarks(currentStudent.id);
    const marksSnap = { docs: asFirestoreDocs(marksRows), empty: !marksRows.length };

    if (marksSnap.empty) {
      featureDiv.innerHTML = '<h2>Marks & Grades</h2><div class="empty">No marks records found.</div>';
      return;
    }
    
    let html = `
      <h2>Marks & Grades - ${currentStudent.name}</h2>
      <div class="marks-filters">
        <label>Subject: </label>
        <select id="subject-filter">
          <option value="">All Subjects</option>
          ${getSubjectOptions(marksSnap.docs)}
        </select>
        <button onclick="exportMarksCSV()" class="export-btn">Export CSV</button>
      </div>
      <div class="marks-table-container">
        <table class="styled-table">
          <thead>
            <tr>
              <th>Exam</th>
              <th>Subject</th>
              <th>Marks</th>
              <th>Max Marks</th>
              <th>Percentage</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    marksSnap.docs.forEach(doc => {
      const m = doc.data();
      const percentage = m.maxMarks > 0 ? Math.round((m.marks / m.maxMarks) * 100) : 0;
      const grade = getGrade(percentage);
      
      html += `
        <tr>
          <td>${m.examName || 'N/A'}</td>
          <td>${m.subject || 'N/A'}</td>
          <td>${m.marks || 'N/A'}</td>
          <td>${m.maxMarks || 'N/A'}</td>
          <td>${percentage}% (${grade})</td>
          <td>${m.date || 'N/A'}</td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
      
      <div class="marks-summary">
        <h3>Performance Summary</h3>
        <div id="marks-chart-container">
          <canvas id="marks-chart" width="400" height="200"></canvas>
        </div>
      </div>
    `;
    
    featureDiv.innerHTML = html;
    
    // Set up subject filter
    document.getElementById('subject-filter').onchange = filterMarksBySubject;
    
    // Render marks chart
    renderMarksChart(marksSnap.docs);
    
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<h2>Marks & Grades</h2><div class="error">Error loading marks data.</div>';
  }
}

async function showBusTracking(user) {
  setActiveNav('bus');
  const featureDiv = document.getElementById('feature-content');
  
  if (!currentStudent) {
    featureDiv.innerHTML = '<h2>Bus Tracking</h2><div class="error">Please go to Overview first to load student data.</div>';
    return;
  }
  
  if (!currentStudent.bus) {
    featureDiv.innerHTML = `
      <h2>Bus Tracking</h2>
      <div class="empty">
        <p>No bus assigned to ${currentStudent.name}.</p>
        <p>Please contact the school administration for bus assignment.</p>
      </div>
    `;
    return;
  }
  
  featureDiv.innerHTML = `
    <h2>Bus Tracking - ${currentStudent.name}</h2>
    <div class="bus-info">
      <h3>Bus Information</h3>
      <p><strong>Bus Number:</strong> ${currentStudent.bus}</p>
      <p><strong>Student:</strong> ${currentStudent.name}</p>
      <p><strong>Class:</strong> ${currentStudent.class} - Section ${currentStudent.section}</p>
    </div>
    
    <div class="bus-status">
      <h3>Current Status</h3>
      <div class="status-indicator">
        <span class="status-dot" id="status-dot"></span>
        <span class="status-text" id="status-text">Checking...</span>
      </div>
    </div>
    
    <div class="bus-map" id="bus-map">
      <h3>Bus Location</h3>
      <div class="map-placeholder">
        <p>Map integration coming soon...</p>
        <p>For real-time tracking, please contact the bus driver or school administration.</p>
      </div>
    </div>
  `;
  
  // Simulate bus status check
  checkBusStatus();
}

async function showNotifications(user) {
  setActiveNav('notifications');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = renderNotificationsLoading('Notifications');

  try {
    const notifications = await fetchParentNotifications();
    featureDiv.innerHTML = renderNotificationsPage({
      pageTitle: 'Notifications',
      pageSubtitle: 'School announcements, attendance alerts, and updates for parents.',
      notifications,
      emptyTitle: 'No notifications yet',
      emptyMessage: 'When the school sends an announcement, it will appear here.',
    });
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = renderNotificationsError(
      'Notifications',
      e.message || 'Error loading notifications.'
    );
  }
}

// Utility functions
function getMonthOptions() {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months.map((month, index) => 
    `<option value="${index + 1}">${month}</option>`
  ).join('');
}

function getSubjectOptions(marksDocs) {
  const subjects = new Set();
  marksDocs.forEach(doc => {
    const m = doc.data();
    if (m.subject) subjects.add(m.subject);
  });
  return Array.from(subjects).map(subject => 
    `<option value="${subject}">${subject}</option>`
  ).join('');
}

function getGrade(percentage) {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B+';
  if (percentage >= 60) return 'B';
  if (percentage >= 50) return 'C+';
  if (percentage >= 40) return 'C';
  return 'F';
}

function filterAttendanceByMonth() {
  // Implementation for filtering attendance by month
  console.log('Filtering attendance by month...');
}

function filterMarksBySubject() {
  // Implementation for filtering marks by subject
  console.log('Filtering marks by subject...');
}

function exportAttendanceCSV() {
  // Implementation for exporting attendance to CSV
  alert('CSV export functionality coming soon...');
}

function exportMarksCSV() {
  // Implementation for exporting marks to CSV
  alert('CSV export functionality coming soon...');
}

function renderAttendanceChart(attendanceDocs) {
  // Implementation for rendering attendance chart
  console.log('Rendering attendance chart...');
}

function renderMarksChart(marksDocs) {
  // Implementation for rendering marks chart
  console.log('Rendering marks chart...');
}

function checkBusStatus() {
  // Simulate bus status check
  setTimeout(() => {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (statusDot && statusText) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Bus is running';
    }
  }, 2000);
}

function renderPortal(user) {
  if (user) {
    renderDashboard(user);
  } else {
    window.location.href = '../common/login.html';
  }
}

onAuthChange(renderPortal, 'parent');
