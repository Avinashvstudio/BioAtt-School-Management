import '../common/auth.js';
import { onAuthChange, logout } from '../common/auth.js';
import { getApiBase } from '../common/config.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, getDoc, setDoc, doc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from '../common/firebase-init.js';

const db = getFirestore(app);
const auth = getAuth(app);
const appDiv = document.getElementById('app');

let currentSection = 'timetable';

function renderDashboard(user) {
  appDiv.innerHTML = `
    <div class="portal-layout">
      <header class="portal-header">
        <div class="header-left">
          <h1 class="portal-title">BioAtt School</h1>
          <div class="brand-sub">Teacher Portal</div>
        </div>
        <div class="header-right">
          <span class="user-info">${user.email}</span>
          <button class="logout-btn" id="logout-btn" type="button">Logout</button>
        </div>
      </header>
      <div class="portal-main">
        <nav class="portal-sidebar">
          <button class="nav-btn" id="nav-timetable" type="button"><span class="nav-icon">📅</span> Timetable</button>
          <button class="nav-btn" id="nav-students" type="button"><span class="nav-icon">🎓</span> My Students</button>
          <button class="nav-btn" id="nav-attendance" type="button"><span class="nav-icon">✅</span> Attendance</button>
          <button class="nav-btn" id="nav-marks" type="button"><span class="nav-icon">📝</span> Marks</button>
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
    { id: 'nav-timetable', section: 'timetable', fn: (user) => showTimetable(user) },
    { id: 'nav-students', section: 'students', fn: (user) => showStudents(user) },
    { id: 'nav-attendance', section: 'attendance', fn: (user) => showAttendance(user) },
    { id: 'nav-marks', section: 'marks', fn: (user) => showMarks(user) },
    { id: 'nav-notifications', section: 'notifications', fn: (user) => showNotifications(user) },
  ];
  navs.forEach(({ id, section, fn }) => {
    document.getElementById(id).onclick = () => {
      setActiveNav(section);
      fn(user);
    };
  });
  setActiveNav(currentSection);
  showTimetable(user);
}

function setActiveNav(section) {
  currentSection = section;
  [
    'nav-timetable',
    'nav-students',
    'nav-attendance',
    'nav-marks',
    'nav-notifications',
  ].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle('active', id === `nav-${section}`);
  });
}

function splitCsv(value) {
  if (!value || typeof value !== 'string') return [];
  return value.split(',').map(s => s.trim()).filter(Boolean);
}

function addClassSectionPair(target, seen, className, section) {
  if (!className || !section) return;
  const key = `${className}__${section}`;
  if (seen.has(key)) return;
  seen.add(key);
  target.push({ class: className, section });
}

function buildPairsFromProfile(classNames, sections) {
  const pairs = [];
  const seen = new Set();
  if (!classNames.length || !sections.length) return pairs;

  // If lengths match, treat values as aligned pairs first.
  if (classNames.length === sections.length) {
    for (let i = 0; i < classNames.length; i++) {
      addClassSectionPair(pairs, seen, classNames[i], sections[i]);
    }
    return pairs;
  }

  // Otherwise, allow any section across listed classes.
  for (const cls of classNames) {
    for (const sec of sections) {
      addClassSectionPair(pairs, seen, cls, sec);
    }
  }
  return pairs;
}

async function getTeacherAssignments(user) {
  const pairs = [];
  const seen = new Set();

  // Primary source: classes collection where teacherId matches current user uid.
  try {
    const classesSnap = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid)));
    classesSnap.forEach(classDoc => {
      const c = classDoc.data();
      const sections = splitCsv(c.section);
      const className = c.name;
      if (!sections.length) addClassSectionPair(pairs, seen, className, c.section);
      for (const sec of sections) {
        addClassSectionPair(pairs, seen, className, sec);
      }
    });
  } catch (error) {
    // Some Firestore rules block teachers from reading classes.
    console.warn('Could not read classes collection, falling back to teacher profile:', error);
  }

  // Fallback source: teacher profile in users collection.
  const teacherDoc = await getDoc(doc(db, 'users', user.uid));
  if (teacherDoc.exists()) {
    const teacherData = teacherDoc.data();
    if ((teacherData.role || '').toLowerCase() === 'teacher') {
      const classNames = splitCsv(teacherData.className);
      const sections = splitCsv(teacherData.section);
      const profilePairs = buildPairsFromProfile(classNames, sections);
      profilePairs.forEach(pair => addClassSectionPair(pairs, seen, pair.class, pair.section));
    }
  }

  return pairs;
}

function classNameVariants(name) {
  const n = (name || '').trim();
  const variants = new Set([n]);
  if (n && !/^class\s/i.test(n)) variants.add(`Class ${n}`);
  if (/^class\s/i.test(n)) variants.add(n.replace(/^class\s+/i, '').trim());
  return [...variants].filter(Boolean);
}

function normalizeSectionValue(section) {
  return (section || '').trim().toUpperCase();
}

function formatClassSectionLabel(className, section) {
  const c = (className || '').trim();
  const s = normalizeSectionValue(section);
  const labelClass = /^class\s/i.test(c) ? c : `Class ${c}`;
  return `${labelClass} - Section ${s}`;
}

async function teacherApi(path) {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

async function fetchTimetableEntries(className, section) {
  const sec = normalizeSectionValue(section);
  const entries = [];
  const seen = new Set();

  for (const cls of classNameVariants(className)) {
    try {
      const snap = await getDocs(
        query(collection(db, 'timetable'), where('class', '==', cls), where('section', '==', sec))
      );
      snap.forEach(d => {
        if (seen.has(d.id)) return;
        seen.add(d.id);
        entries.push({ id: d.id, ...d.data() });
      });
      if (entries.length) return entries;
    } catch (error) {
      console.warn(`Timetable query failed for ${cls}/${sec}:`, error);
    }
  }

  const data = await teacherApi(
    `${getApiBase()}/api/teacher/timetable?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sec)}`
  );
  return data.entries || [];
}

async function fetchStudentsForClass(className, section) {
  const sec = normalizeSectionValue(section);
  for (const cls of classNameVariants(className)) {
    try {
      const snap = await getDocs(
        query(collection(db, 'students'), where('class', '==', cls), where('section', '==', sec))
      );
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (error) {
      console.warn(`Students query failed for ${cls}/${sec}:`, error);
    }
  }
  const data = await teacherApi(
    `${getApiBase()}/api/teacher/students?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sec)}`
  );
  return data.students || [];
}

async function fetchAttendanceRecords(className, section, dateStr) {
  const sec = normalizeSectionValue(section);
  for (const cls of classNameVariants(className)) {
    try {
      let q = query(
        collection(db, 'attendance'),
        where('class', '==', cls),
        where('section', '==', sec)
      );
      if (dateStr) {
        q = query(q, where('date', '==', dateStr));
      }
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (error) {
      console.warn(`Attendance query failed for ${cls}/${sec}:`, error);
    }
  }
  let path = `${getApiBase()}/api/teacher/attendance?class=${encodeURIComponent(className)}&section=${encodeURIComponent(sec)}`;
  if (dateStr) path += `&date=${encodeURIComponent(dateStr)}`;
  const data = await teacherApi(path);
  return data.records || [];
}

function renderTimetableGrid(entries, tableDiv) {
  if (!entries.length) {
    tableDiv.innerHTML = '<div class="empty">No timetable found for this class/section. Ask admin to add entries in Admin → Timetable.</div>';
    return;
  }
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  let maxPeriod = 1;
  const periodMap = {};
  entries.forEach(t => {
    if (t.period && Number(t.period) > maxPeriod) maxPeriod = Number(t.period);
    periodMap[`${t.day}_${t.period}`] = t;
  });
  let html = '<table class="data-table"><thead><tr><th>Day</th>';
  for (let p = 1; p <= maxPeriod; ++p) html += `<th>Period ${p}</th>`;
  html += '</tr></thead><tbody>';
  days.forEach(day => {
    html += `<tr><td>${day}</td>`;
    for (let p = 1; p <= maxPeriod; ++p) {
      const t = periodMap[`${day}_${p}`];
      if (t) {
        html += `<td><strong>${t.subject || ''}</strong><br><span style="font-size:0.85em;color:#64748b;">${t.teacherName || ''}</span><br><span style="font-size:0.8em;color:#94a3b8;">${t.start || ''} - ${t.end || ''}</span></td>`;
      } else {
        html += '<td>-</td>';
      }
    }
    html += '</tr>';
  });
  html += '</tbody></table>';
  tableDiv.innerHTML = html;
}

async function showTimetable(user) {
  setActiveNav('timetable');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>Timetable</h2><div class="loading">Loading...</div>';
  try {
    // 1. Find all classes/sections where teacher is class teacher.
    const teacherAssignments = await getTeacherAssignments(user);
    const classTeacherList = [];
    teacherAssignments.forEach(item => {
      classTeacherList.push({ name: item.class, section: item.section, role: 'Class Teacher' });
    });
    // 2. Find all classes/sections where teacher teaches any subject
    let timetableSnap = null;
    try {
      timetableSnap = await getDocs(query(collection(db, 'timetable'), where('teacherId', '==', user.uid)));
    } catch (error) {
      console.warn('Could not read timetable by teacherId; showing class-teacher assignments only:', error);
    }
    const subjectTeacherList = [];
    if (timetableSnap) {
      timetableSnap.forEach(doc => {
        const t = doc.data();
        subjectTeacherList.push({ name: t.class, section: t.section, role: 'Subject Teacher' });
      });
    }
    // 3. Merge and deduplicate (by class+section)
    const classSectionMap = {};
    [...classTeacherList, ...subjectTeacherList].forEach(item => {
      const key = `${item.name}__${item.section}`;
      if (!classSectionMap[key]) {
        classSectionMap[key] = { name: item.name, section: item.section, roles: new Set() };
      }
      classSectionMap[key].roles.add(item.role);
    });
    const classSectionList = Object.values(classSectionMap);
    if (classSectionList.length === 0) {
      featureDiv.innerHTML = '<h2>Timetable</h2><div class="empty">No classes/sections assigned to you.</div>';
      return;
    }
    // 4. Build dropdown
    let classOptions = '';
    classSectionList.forEach(cs => {
      const roles = Array.from(cs.roles).join(', ');
      const label = formatClassSectionLabel(cs.name, cs.section);
      classOptions += `<option value="${cs.name}__${normalizeSectionValue(cs.section)}">${label}${roles ? ` (${roles})` : ''}</option>`;
    });
    featureDiv.innerHTML = `
      <div class="page-header">
        <h1>Timetable</h1>
        <p>View the weekly schedule for your assigned classes.</p>
      </div>
      <div class="card">
        <label for="class-section-select">Select Class/Section</label>
        <select id="class-section-select" class="filter-select" style="width:100%;max-width:360px;margin-top:0.5rem;">${classOptions}</select>
        <div id="timetable-table" style="margin-top:1.25rem;"></div>
      </div>`;
    const select = document.getElementById('class-section-select');
    async function renderTimetableForClassSection(cls, section) {
      const tableDiv = document.getElementById('timetable-table');
      tableDiv.innerHTML = '<div class="loading">Loading timetable...</div>';
      try {
        const entries = await fetchTimetableEntries(cls, section);
        renderTimetableGrid(entries, tableDiv);
      } catch (error) {
        tableDiv.innerHTML = `<div class="error">Could not load timetable: ${error.message}. If this persists, ask admin to publish updated Firestore rules.</div>`;
      }
    }
    // Initial render
    const [firstClass, firstSection] = select.value.split('__');
    renderTimetableForClassSection(firstClass, firstSection);
    select.onchange = () => {
      const [cls, section] = select.value.split('__');
      renderTimetableForClassSection(cls, section);
    };
  } catch (e) {
    featureDiv.innerHTML = '<h2>Timetable</h2><div class="error">Error loading timetable.</div>';
  }
}

async function showStudents(user) {
  setActiveNav('students');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>My Students</h2><div class="loading">Loading...</div>';
  try {
    // Fetch classes where this teacher is assigned.
    const classSectionPairs = await getTeacherAssignments(user);
    if (classSectionPairs.length === 0) {
      featureDiv.innerHTML = '<h2>My Students</h2><div class="empty">No classes/sections assigned to you.</div>';
      return;
    }
    let html = '';
    let foundStudents = false;
    for (const cs of classSectionPairs) {
      const students = await fetchStudentsForClass(cs.class, cs.section);
      if (!students.length) continue;
      foundStudents = true;
      html += `<div class="student-group"><h3>Class ${cs.class} - Section ${cs.section}</h3>`;
      html += '<table class="styled-table"><thead><tr><th>Name</th><th>Parent Email</th><th>Bus</th></tr></thead><tbody>';
      students.forEach(s => {
        html += `<tr><td>${s.name || ''}</td><td>${s.parentEmail || ''}</td><td>${s.bus || ''}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }
    if (!foundStudents) html = '<div class="empty">No students found for your classes/sections.</div>';
    featureDiv.innerHTML = '<h2>My Students</h2>' + html;
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<h2>My Students</h2><div class="error">An unexpected error occurred while loading students.</div>';
  }
}

async function showAttendance(user) {
  setActiveNav('attendance');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>Attendance</h2><div class="loading">Loading...</div>';
  try {
    // Fetch classes where this teacher is assigned.
    const classSectionPairs = await getTeacherAssignments(user);
    if (classSectionPairs.length === 0) {
      featureDiv.innerHTML = '<h2>Attendance</h2><div class="empty">No classes/sections assigned to you.</div>';
      return;
    }
    // If no students found for any class-section, show a helpful message
    let foundStudents = false;
    for (const cs of classSectionPairs) {
      const students = await fetchStudentsForClass(cs.class, cs.section);
      if (students.length) {
        foundStudents = true;
        break;
      }
    }
    if (!foundStudents) {
      featureDiv.innerHTML = '<h2>Attendance</h2><div class="empty">No students found for your classes/sections. Please add students first.</div>';
      return;
    }
    // 4. Build class/section dropdown
    let classOptions = '';
    classSectionPairs.forEach(cs => {
      classOptions += `<option value="${cs.class}__${cs.section}">Class ${cs.class} - Section ${cs.section}</option>`;
    });
    featureDiv.innerHTML = `<h2>Attendance</h2>
      <label for="class-section-select">Select Class/Section: </label>
      <select id="class-section-select">${classOptions}</select>
      <label for="attendance-date" style="margin-left:16px;">Date: </label>
      <input type="date" id="attendance-date" />
      <button id="export-attendance-btn" style="margin-left:16px;">Export CSV</button>
      <div id="attendance-table"></div>
      <div id="attendance-history"></div>
      <canvas id="attendance-chart" style="max-width:600px;margin-top:24px;"></canvas>`;
    const select = document.getElementById('class-section-select');
    const dateInput = document.getElementById('attendance-date');
    const exportBtn = document.getElementById('export-attendance-btn');
    // Set default date to today
    const today = new Date();
    dateInput.value = today.toISOString().slice(0, 10);
    let lastClass = '', lastSection = '';
    async function renderAttendanceTable(cls, section, dateStr) {
      lastClass = cls; lastSection = section;
      const tableDiv = document.getElementById('attendance-table');
      tableDiv.innerHTML = '<div class="loading">Loading students...</div>';
      try {
      const students = await fetchStudentsForClass(cls, section);
      if (!students.length) {
        tableDiv.innerHTML = '<div class="empty">No students found in this class/section.</div>';
        return;
      }
      const attRecords = await fetchAttendanceRecords(cls, section, dateStr);
      const attMap = {};
      attRecords.forEach(a => {
        attMap[a.studentId] = a.status;
      });
      let html = `<form class="attendance-form" data-class="${cls}" data-section="${section}">
        <h3>Class ${cls} - Section ${section} | Date: ${dateStr}</h3>
        <div style="margin-bottom: 10px; display: flex; gap: 8px;">
          <button type="button" id="select-all-present" style="padding: 4px 12px; font-size: 0.95em; border-radius: 4px; background: #4063a3; color: #fff; border: none; cursor: pointer;">Select All Present</button>
          <button type="button" id="select-all-left" style="padding: 4px 12px; font-size: 0.95em; border-radius: 4px; background: #ff9800; color: #fff; border: none; cursor: pointer;">Select All Left for Home</button>
        </div>
        <table class="styled-table" style="min-width: 500px; text-align: center;"><thead><tr><th>Name</th><th>Present</th><th>Absent</th><th>Left for Home</th></tr></thead><tbody>`;
      students.forEach(s => {
        const status = attMap[s.id] || 'Present';
        html += `<tr style="text-align: center;">
          <td style="text-align: left;">${s.name || ''}</td>
          <td style="vertical-align: middle;"><input type="checkbox" class="att-present" data-student-id="${s.id}" style="margin: 0 auto; display: block;" ${status === 'Present' ? 'checked' : ''}></td>
          <td style="vertical-align: middle;"><input type="checkbox" class="att-absent" data-student-id="${s.id}" style="margin: 0 auto; display: block;" ${status === 'Absent' ? 'checked' : ''}></td>
          <td style="vertical-align: middle;"><input type="checkbox" class="att-left" data-student-id="${s.id}" style="margin: 0 auto; display: block;" ${status === 'Left for Home' ? 'checked' : ''}></td>
        </tr>`;
      });
      html += '</tbody></table>';
      html += `<button type="submit" class="save-attendance-btn" style="margin-top: 16px; padding: 6px 18px; font-size: 1em; border-radius: 4px; background: #4063a3; color: #fff; border: none; cursor: pointer;">Save Attendance</button>
        <div class="attendance-status"></div>
      </form>`;
      tableDiv.innerHTML = html;

      // Mutually exclusive checkboxes logic
      document.querySelectorAll('.att-present').forEach(cb => {
        cb.addEventListener('change', function() {
          const id = this.getAttribute('data-student-id');
          if (this.checked) {
            document.querySelector(`.att-absent[data-student-id='${id}']`).checked = false;
            document.querySelector(`.att-left[data-student-id='${id}']`).checked = false;
          }
        });
      });
      document.querySelectorAll('.att-absent').forEach(cb => {
        cb.addEventListener('change', function() {
          const id = this.getAttribute('data-student-id');
          if (this.checked) {
            document.querySelector(`.att-present[data-student-id='${id}']`).checked = false;
            document.querySelector(`.att-left[data-student-id='${id}']`).checked = false;
          }
        });
      });
      document.querySelectorAll('.att-left').forEach(cb => {
        cb.addEventListener('change', function() {
          const id = this.getAttribute('data-student-id');
          if (this.checked) {
            document.querySelector(`.att-present[data-student-id='${id}']`).checked = false;
            document.querySelector(`.att-absent[data-student-id='${id}']`).checked = false;
          }
        });
      });

      // Select All Present
      document.getElementById('select-all-present').onclick = () => {
        document.querySelectorAll('.att-present').forEach(cb => {
          cb.checked = true;
          const id = cb.getAttribute('data-student-id');
          document.querySelector(`.att-absent[data-student-id='${id}']`).checked = false;
          document.querySelector(`.att-left[data-student-id='${id}']`).checked = false;
        });
      };
      // Select All Left for Home (only those currently Present)
      document.getElementById('select-all-left').onclick = () => {
        document.querySelectorAll('.att-present').forEach(cb => {
          const id = cb.getAttribute('data-student-id');
          if (cb.checked) {
            cb.checked = false;
            document.querySelector(`.att-left[data-student-id='${id}']`).checked = true;
            document.querySelector(`.att-absent[data-student-id='${id}']`).checked = false;
          }
        });
      };

      // Save logic
      document.querySelector('.attendance-form').onsubmit = async (e) => {
        e.preventDefault();
        const statusDiv = document.querySelector('.attendance-status');
        statusDiv.textContent = 'Saving...';
        try {
          let attendanceRecords = [];
          for (const stuData of students) {
            const studentId = stuData.id;
            let status = 'Present';
            if (document.querySelector(`.att-absent[data-student-id='${studentId}']`).checked) status = 'Absent';
            else if (document.querySelector(`.att-left[data-student-id='${studentId}']`).checked) status = 'Left for Home';
            // Get current time
            const now = new Date().toISOString();
            let presentTime = null, leftTime = null;
            if (status === 'Present') presentTime = now;
            else if (status === 'Left for Home') leftTime = now;
            await setDoc(doc(db, 'attendance', `${dateInput.value}_${cls}_${section}_${studentId}`), {
              date: dateInput.value,
              class: cls,
              section,
              studentId,
              studentName: stuData.name || '',
              status,
              teacherId: user.uid,
              presentTime: presentTime || '',
              leftTime: leftTime || ''
            });
            if (stuData.parentEmail) {
              attendanceRecords.push({
                parent_email: stuData.parentEmail,
                student_name: stuData.name || studentId,
                status,
                date: dateInput.value
              });
            }
          }
          // Always send emails for all students with a parent email
          statusDiv.textContent = 'Attendance saved! Sending notifications in 5 seconds...';
          let countdown = 5;
          const interval = setInterval(() => {
            countdown--;
            statusDiv.textContent = `Attendance saved! Sending notifications in ${countdown} seconds...`;
            if (countdown === 0) {
              clearInterval(interval);
          if (attendanceRecords.length > 0) {
            fetch(`${getApiBase()}/send-attendance-emails`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ records: attendanceRecords })
            })
            .then(res => res.json())
            .then(data => {
              if (data.results && data.results.length) {
                    statusDiv.textContent = `Attendance saved! Notifications sent to parents.`;
                  } else {
                    statusDiv.textContent = `Attendance saved! (No parent emails sent)`;
              }
            })
            .catch(err => {
                  statusDiv.textContent = `Attendance saved! Email error: ${err.message}`;
            });
              } else {
                statusDiv.textContent = `Attendance saved! (No parent emails sent)`;
              }
          }
          }, 1000);
          await renderAttendanceHistory(cls, section);
        } catch (err) {
          statusDiv.textContent = 'Error: ' + err.message;
        }
      };
      try {
        await renderAttendanceHistory(cls, section);
      } catch (histErr) {
        console.warn('Attendance history failed:', histErr);
        const historyDiv = document.getElementById('attendance-history');
        if (historyDiv) {
          historyDiv.innerHTML = '<div class="empty">Could not load attendance history. Daily marking still works above.</div>';
        }
      }
      } catch (err) {
        console.error(err);
        tableDiv.innerHTML = `<div class="error">Could not load attendance: ${err.message}</div>`;
      }
    }
    async function renderAttendanceHistory(cls, section) {
      const historyDiv = document.getElementById('attendance-history');
      historyDiv.innerHTML = '<div class="loading">Loading attendance history...</div>';
      const attRecords = await fetchAttendanceRecords(cls, section);
      if (!attRecords.length) {
        historyDiv.innerHTML = '<div class="empty">No attendance records found.</div>';
        return;
      }
      window.attSnapCache = {
        docs: attRecords.map(r => ({
          id: r.id,
          data: () => r,
        })),
      };
      const studentList = await fetchStudentsForClass(cls, section);
      const students = {};
      studentList.forEach(s => {
        students[s.id] = s.name || s.id;
      });
      const attendanceByDate = {};
      const studentSummary = {};
      attRecords.forEach(a => {
        if (!attendanceByDate[a.date]) attendanceByDate[a.date] = {};
        attendanceByDate[a.date][a.studentId] = a.status;
        if (!studentSummary[a.studentId]) studentSummary[a.studentId] = { present: 0, absent: 0, left: 0 };
        if (a.status === 'Present') studentSummary[a.studentId].present++;
        else if (a.status === 'Absent') studentSummary[a.studentId].absent++;
        else if (a.status === 'Left for Home') studentSummary[a.studentId].left++;
      });
      // Filters UI
      const dates = Object.keys(attendanceByDate).sort();
      let minDate = dates[0] || '';
      let maxDate = dates[dates.length - 1] || '';
      historyDiv.innerHTML = `
        <div style="margin: 1rem 0; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;">
          <label>Date from: <input type="date" id="att-date-from" value="${minDate}"></label>
          <label>Date to: <input type="date" id="att-date-to" value="${maxDate}"></label>
          <label>Search Student: <input type="text" id="att-search" placeholder="Type name..."></label>
          <button id="att-filter-btn">Apply</button>
        </div>
        <div id="attendance-history-table"></div>
      `;
      function filterAndRender() {
        const from = document.getElementById('att-date-from').value;
        const to = document.getElementById('att-date-to').value;
        const search = document.getElementById('att-search').value.trim().toLowerCase();
        // Filter dates
        const filteredDates = dates.filter(date => (!from || date >= from) && (!to || date <= to));
        // Filter students
        const filteredStudents = Object.entries(students).filter(([id, name]) => name.toLowerCase().includes(search));
        // Table: Dates as columns, students as rows
        let html = '<table class="styled-table"><thead style="display:none;"><tr><th>Name</th>';
        filteredDates.forEach(date => { html += `<th>${date}</th>`; });
        html += '<th>Presents</th><th>Absents</th><th>Left</th><th>%</th><th>Present Time</th><th>Left Time</th></tr></thead><tbody>';
        for (const [studentId, studentName] of filteredStudents) {
          html += `<tr><td>${studentName}</td>`;
          filteredDates.forEach(date => {
            const status = attendanceByDate[date][studentId];
            let color = status === 'Present' ? 'green' : status === 'Absent' ? 'red' : status === 'Left for Home' ? 'orange' : '#888';
            html += `<td style="color:${color};font-weight:bold;">${status || '-'}</td>`;
          });
          const summary = studentSummary[studentId] || { present: 0, absent: 0, left: 0 };
          const total = summary.present + summary.absent + summary.left;
          const percent = total ? Math.round((summary.present / total) * 100) : 0;
          // Show presentTime and leftTime for the latest date
          let lastDate = filteredDates[filteredDates.length-1];
          let presentTime = '', leftTime = '';
          if (lastDate && attendanceByDate[lastDate] && attendanceByDate[lastDate][studentId]) {
            const attSnap = window.attSnapCache || [];
            let attDoc = null;
            if (attSnap && attSnap.docs) {
              attDoc = attSnap.docs.find(doc => {
                const a = doc.data();
                return a.date === lastDate && a.studentId === studentId;
              });
            }
            if (attDoc) {
              const a = attDoc.data();
              presentTime = a.presentTime || '';
              leftTime = a.leftTime || '';
            }
          }
          html += `<td>${summary.present}</td><td>${summary.absent}</td><td>${summary.left}</td><td>${percent}%</td><td>${presentTime ? presentTime.substring(11,16) : '-'}</td><td>${leftTime ? leftTime.substring(11,16) : '-'}</td></tr>`;
        }
        html += '</tbody></table>';
        document.getElementById('attendance-history-table').innerHTML = html;
        // Chart
        const chartCanvas = document.getElementById('attendance-chart');
        if (chartCanvas) {
          const labels = filteredStudents.map(([id, name]) => name);
          const data = filteredStudents.map(([id]) => {
            const summary = studentSummary[id] || { present: 0, absent: 0, left: 0 };
            const total = summary.present + summary.absent + summary.left;
          return total ? Math.round((summary.present / total) * 100) : 0;
        });
          if (window.attendanceChart) window.attendanceChart.destroy();
          window.attendanceChart = new Chart(chartCanvas, {
          type: 'bar',
          data: {
            labels,
            datasets: [{
              label: 'Attendance %',
              data,
              backgroundColor: '#4063a3',
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { min: 0, max: 100, title: { display: true, text: '%' } } }
          }
        });
        }
      }
      document.getElementById('att-filter-btn').onclick = filterAndRender;
      document.getElementById('att-date-from').onchange = filterAndRender;
      document.getElementById('att-date-to').onchange = filterAndRender;
      document.getElementById('att-search').oninput = filterAndRender;
      filterAndRender();
      // Export CSV
      exportBtn.onclick = () => {
        let csv = 'Name';
        const filteredDates = dates.filter(date => (!document.getElementById('att-date-from').value || date >= document.getElementById('att-date-from').value) && (!document.getElementById('att-date-to').value || date <= document.getElementById('att-date-to').value));
        filteredDates.forEach(date => { csv += ',' + date; });
        csv += ',Presents,Absents,Left,%\n';
        for (const [studentId, studentName] of Object.entries(students)) {
          csv += `"${studentName}"`;
          filteredDates.forEach(date => {
            csv += ',' + (attendanceByDate[date][studentId] || '-');
          });
          const summary = studentSummary[studentId] || { present: 0, absent: 0, left: 0 };
          const total = summary.present + summary.absent + summary.left;
          const percent = total ? Math.round((summary.present / total) * 100) : 0;
          csv += `,${summary.present},${summary.absent},${summary.left},${percent}%\n`;
        }
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance_${cls}_${section}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      };
    }
    // Initial render
    const [firstClass, firstSection] = select.value.split('__');
    renderAttendanceTable(firstClass, firstSection, dateInput.value);
    select.onchange = () => {
      const [cls, section] = select.value.split('__');
      renderAttendanceTable(cls, section, dateInput.value);
    };
    dateInput.onchange = () => {
      const [cls, section] = select.value.split('__');
      renderAttendanceTable(cls, section, dateInput.value);
    };
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<h2>Attendance</h2><div class="error">An unexpected error occurred while loading attendance form.</div>';
  }
}

async function showMarks(user) {
  setActiveNav('marks');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>Marks</h2><div class="loading">Loading...</div>';
  try {
    // Fetch teacher user doc and parse className/section/subjects (case-insensitive email)
    const userSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'teacher')));
    let classNames = [], sections = [], teacherSubjects = [];
    let teacherUser = null;
    if (!userSnap.empty) {
      // Find user by email, case-insensitive
      teacherUser = userSnap.docs.map(doc => doc.data()).find(u => u.email && u.email.toLowerCase() === user.email.toLowerCase());
      if (teacherUser) {
        if (teacherUser.className) classNames = teacherUser.className.split(',').map(s => s.trim());
        if (teacherUser.section) sections = teacherUser.section.split(',').map(s => s.trim());
        if (teacherUser.subjects) teacherSubjects = teacherUser.subjects.split(',').map(s => s.trim().toLowerCase());
      }
    }
    if (!teacherUser || classNames.length === 0 || sections.length === 0 || teacherSubjects.length === 0) {
      featureDiv.innerHTML = '<h2>Marks</h2><div class="empty">No classes/sections/subjects assigned to you.</div>';
      return;
    }
    // Build all class-section pairs
    const classSectionPairs = [];
    for (const cls of classNames) {
      for (const sec of sections) {
        classSectionPairs.push({ class: cls, section: sec });
      }
    }
    // Fetch exams for these class-section pairs
    let exams = [];
    for (const pair of classSectionPairs) {
      const examsSnap = await getDocs(query(collection(db, 'exams'), where('class', '==', pair.class), where('section', '==', pair.section)));
      examsSnap.forEach(doc => {
        const exam = { id: doc.id, ...doc.data() };
        // Only include exams where at least one subject matches teacher's subjects (case-insensitive)
        if (exam.subjects && exam.subjects.some(subj => teacherSubjects.includes(subj.name.toLowerCase()))) {
          exams.push(exam);
        }
      });
    }
    if (exams.length === 0) {
      featureDiv.innerHTML = '<h2>Marks</h2><div class="empty">No exams found for your classes/sections/subjects.</div>';
      return;
    }
    // Show exam/subject selection, but only show teacher's subjects
    let html = `<h2>Marks</h2><div style="margin-bottom:16px;">
      <label>Select Exam: <select id="exam-select"><option value="">-- Select Exam --</option>${exams.map(e => `<option value="${e.id}">${e.name} (${e.class} ${e.section})</option>`).join('')}</select></label>
      <label style="margin-left:16px;">Subject: <select id="subject-select"><option value="">-- Select Subject --</option></select></label>
    </div><div id="marks-entry"></div>`;
    featureDiv.innerHTML = html;
    const examSelect = document.getElementById('exam-select');
    const subjectSelect = document.getElementById('subject-select');
    const marksEntryDiv = document.getElementById('marks-entry');
    let selectedExam = null;
    examSelect.onchange = async () => {
      const examId = examSelect.value;
      selectedExam = exams.find(e => e.id === examId);
      if (!selectedExam) {
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        marksEntryDiv.innerHTML = '';
        return;
      }
      // Only show subjects in this exam that the teacher teaches (case-insensitive)
      const relevantSubjects = selectedExam.subjects.filter(s => teacherSubjects.includes(s.name.toLowerCase()));
      subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>' + relevantSubjects.map(s => `<option value="${s.name}" data-max="${s.max}">${s.name} (Max: ${s.max})</option>`).join('');
      marksEntryDiv.innerHTML = '';
    };
    subjectSelect.onchange = async () => {
      if (!selectedExam) return;
      const subjectName = subjectSelect.value;
      const subjectObj = selectedExam.subjects.find(s => s.name === subjectName);
      if (!subjectObj) {
        marksEntryDiv.innerHTML = '';
        return;
      }
      // Fetch students for this class/section
      const studentsSnap = await getDocs(query(collection(db, 'students'), where('class', '==', selectedExam.class), where('section', '==', selectedExam.section)));
      if (studentsSnap.empty) {
        marksEntryDiv.innerHTML = '<div class="empty">No students found for this class/section.</div>';
        return;
      }
      // Fetch existing marks for this exam/subject
      const marksSnap = await getDocs(query(collection(db, 'marks'), where('examId', '==', selectedExam.id), where('subject', '==', subjectName)));
      const marksMap = {};
      marksSnap.forEach(doc => { const m = doc.data(); marksMap[m.studentId] = m.marks; });
      let formHtml = `<form id="marks-form"><table class="styled-table"><thead><tr><th>Name</th><th>Marks (Max: ${subjectObj.max})</th></tr></thead><tbody>`;
      studentsSnap.forEach(stuDoc => {
        const s = stuDoc.data();
        const val = marksMap[stuDoc.id] !== undefined ? marksMap[stuDoc.id] : '';
        formHtml += `<tr><td>${s.name || ''}</td><td><input type="number" name="marks-${stuDoc.id}" min="0" max="${subjectObj.max}" value="${val}" required style="width:70px;"></td></tr>`;
      });
      formHtml += '</tbody></table>';
      formHtml += `<button type="submit" class="save-marks-btn">Save Marks</button><div class="marks-status"></div></form>`;
      marksEntryDiv.innerHTML = formHtml;
      document.getElementById('marks-form').onsubmit = async (e) => {
        e.preventDefault();
        const statusDiv = document.querySelector('.marks-status');
        statusDiv.textContent = 'Saving...';
        try {
          for (const stuDoc of studentsSnap.docs) {
            const studentId = stuDoc.id;
            const marks = parseInt(document.querySelector(`input[name="marks-${studentId}"]`).value, 10);
            await setDoc(doc(db, 'marks', `${selectedExam.id}_${subjectName}_${studentId}`), {
              examId: selectedExam.id,
              examName: selectedExam.name,
              class: selectedExam.class,
              section: selectedExam.section,
              term: selectedExam.term,
              date: selectedExam.date,
              subject: subjectName,
              maxMarks: subjectObj.max,
              studentId,
              marks,
              teacherId: user.uid
            });
          }
          statusDiv.textContent = 'Marks saved!';
        } catch (err) {
          statusDiv.textContent = 'Error: ' + err.message;
        }
      };
    };
  } catch (e) {
    console.error(e);
    featureDiv.innerHTML = '<h2>Marks</h2><div class="error">Error loading marks form.</div>';
  }
}

async function showNotifications(user) {
  setActiveNav('notifications');
  const featureDiv = document.getElementById('feature-content');
  featureDiv.innerHTML = '<h2>Notifications</h2><div class="loading">Loading...</div>';
  try {
    const notifQ = query(collection(db, 'notifications'), where('role', 'in', ['teacher', 'all']));
    const notifSnap = await getDocs(notifQ);
    let notifications = [];
    notifSnap.forEach(doc => notifications.push(doc.data()));
    notifications.sort((a, b) => (b.time || 0) - (a.time || 0));
    if (!notifications.length) {
      featureDiv.innerHTML = '<h2>Notifications</h2><div class="empty">No notifications found for you.</div>';
      return;
    }
    let html = '<ul class="notifications-list" style="list-style:none;padding:0;">';
    notifications.forEach(n => {
      html += `<li style="margin-bottom:1em;">
        <div><b>${n.title || 'Notification'}</b> <span style="color:#888;font-size:0.95em;">(${n.category || 'general'})</span></div>
        <div>${n.message}</div>
        <div style="font-size:0.9em;color:#888;">${n.time ? new Date(n.time).toLocaleString() : ''}</div>
      </li>`;
    });
    html += '</ul>';
    featureDiv.innerHTML = '<h2>Notifications</h2>' + html;
  } catch (e) {
    featureDiv.innerHTML = '<h2>Notifications</h2><div class="error">Error loading notifications.</div>';
  }
}

function renderPortal(user) {
  if (user) {
    renderDashboard(user);
  } else {
    window.location.href = '../common/login.html';
  }
}

onAuthChange(renderPortal, 'teacher');

// Add modal HTML to the page root if not present
if (!document.getElementById('student-profile-modal')) {
  const modalDiv = document.createElement('div');
  modalDiv.id = 'student-profile-modal';
  modalDiv.style.display = 'none';
  modalDiv.innerHTML = `
    <div class="modal-bg" style="position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.5);z-index:1000;display:flex;align-items:center;justify-content:center;">
      <div class="modal-content" style="background:#fff;padding:2rem;border-radius:8px;min-width:320px;max-width:90vw;max-height:90vh;overflow:auto;position:relative;">
        <button id="close-profile-modal" style="position:absolute;top:8px;right:8px;font-size:1.2rem;">&times;</button>
        <div id="profile-modal-body"></div>
      </div>
    </div>
  `;
  document.body.appendChild(modalDiv);
  document.getElementById('close-profile-modal').onclick = () => {
    modalDiv.style.display = 'none';
  };
  modalDiv.onclick = (e) => { if (e.target.classList.contains('modal-bg')) modalDiv.style.display = 'none'; };
}

// Utility to show student profile modal
async function showStudentProfileModal(studentId, className, section) {
  const modalDiv = document.getElementById('student-profile-modal');
  const bodyDiv = document.getElementById('profile-modal-body');
  bodyDiv.innerHTML = '<div class="loading">Loading...</div>';
  modalDiv.style.display = 'flex';
  // Fetch student details
  const stuSnap = await getDocs(query(collection(db, 'students'), where('class', '==', className), where('section', '==', section), where('__name__', '==', studentId)));
  if (stuSnap.empty) {
    bodyDiv.innerHTML = '<div class="error">Student not found.</div>';
    return;
  }
  const s = stuSnap.docs[0].data();
  // Attendance analytics
  const attSnap = await getDocs(query(collection(db, 'attendance'), where('studentId', '==', studentId)));
  let present = 0, absent = 0, left = 0;
  attSnap.forEach(doc => { const a = doc.data(); if (a.status === 'Present') present++; else if (a.status === 'Absent') absent++; else if (a.status === 'Left for Home') left++; });
  // Marks analytics
  const marksSnap = await getDocs(query(collection(db, 'marks'), where('studentId', '==', studentId)));
  let marksData = [];
  marksSnap.forEach(doc => { const m = doc.data(); marksData.push(m); });
  // Modal content
  bodyDiv.innerHTML = `
    <h2>${s.name || studentId}</h2>
    <p><b>Class:</b> ${className} <b>Section:</b> ${section}</p>
    <p><b>Parent Email:</b> ${s.parentEmail || ''}</p>
    <p><b>Bus:</b> ${s.bus || ''}</p>
    <p><b>Photo:</b> ${s.photoURL ? `<img src='${s.photoURL}' alt='photo' style='width:64px;height:64px;border-radius:50%;'/>` : 'N/A'}</p>
    <div><b>Attendance:</b> Present: ${present}, Absent: ${absent}, Left: ${left}</div>
    <canvas id="profile-attendance-chart" width="300" height="150"></canvas>
    <div><b>Marks:</b></div>
    <canvas id="profile-marks-chart" width="300" height="150"></canvas>
  `;
  // Render attendance chart
  setTimeout(() => {
    const ctx = document.getElementById('profile-attendance-chart').getContext('2d');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Present', 'Absent', 'Left for Home'],
        datasets: [{ data: [present, absent, left], backgroundColor: ['#4caf50', '#f44336', '#ff9800'] }]
      },
      options: { responsive: false, plugins: { legend: { position: 'bottom' } } }
    });
  }, 0);
  // Render marks chart
  setTimeout(() => {
    const ctx = document.getElementById('profile-marks-chart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: marksData.map(m => `${m.subject || ''} (${m.exam || ''})`),
        datasets: [{ label: 'Marks', data: marksData.map(m => m.marks), backgroundColor: '#4063a3' }]
      },
      options: { responsive: false, plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } } }
    });
  }, 0);
}

// Patch student tables to make names clickable in showStudents and showAttendance
const origShowStudents = showStudents;
showStudents = async function(teacherUid) {
  await origShowStudents(teacherUid);
  document.querySelectorAll('.student-group table.styled-table tbody tr').forEach(row => {
    const nameCell = row.querySelector('td');
    if (nameCell && nameCell.textContent) {
      const studentName = nameCell.textContent;
      const classSection = row.closest('.student-group').querySelector('h3').textContent.match(/Class (.+) - Section (.+)/);
      if (classSection) {
        const className = classSection[1];
        const section = classSection[2];
        nameCell.style.cursor = 'pointer';
        nameCell.style.textDecoration = 'underline';
        nameCell.onclick = () => {
          // Find studentId by matching name in Firestore (could be improved if id is available)
          getDocs(query(collection(db, 'students'), where('class', '==', className), where('section', '==', section), where('name', '==', studentName))).then(snap => {
            if (!snap.empty) {
              showStudentProfileModal(snap.docs[0].id, className, section);
            }
          });
        };
      }
    }
  });
};
// Patch attendance table similarly after rendering
const origShowAttendance = showAttendance;
showAttendance = async function(teacherUid) {
  await origShowAttendance(teacherUid);
  document.querySelectorAll('.attendance-form tbody tr').forEach(row => {
    const nameCell = row.querySelector('td');
    if (nameCell && nameCell.textContent) {
      const studentName = nameCell.textContent;
      const form = row.closest('form');
      const className = form.getAttribute('data-class');
      const section = form.getAttribute('data-section');
      nameCell.style.cursor = 'pointer';
      nameCell.style.textDecoration = 'underline';
      nameCell.onclick = () => {
        getDocs(query(collection(db, 'students'), where('class', '==', className), where('section', '==', section), where('name', '==', studentName))).then(snap => {
          if (!snap.empty) {
            showStudentProfileModal(snap.docs[0].id, className, section);
          }
        });
      };
    }
  });
}; 