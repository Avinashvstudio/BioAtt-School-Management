// Driver Portal JS
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, setDoc, doc, updateDoc, serverTimestamp, getDoc, addDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from '../common/firebase-init.js';
import { getApiBase } from '../common/config.js';
import {
  fetchNotificationsForRoles,
  renderNotificationsPage,
  renderNotificationsLoading,
  renderNotificationsError,
} from '../common/notifications-ui.js';
import { onAuthChange, logout, loadUserProfile } from '../common/auth.js';

const auth = getAuth(app);
const db = getFirestore(app);
const mainDiv = document.getElementById('driver-main');
let locationInterval = null;

async function getAuthToken() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
}

function formatBusStatus(att) {
  if (!att) return '';
  let status = '';
  if (att.pickupTime) status += `Picked Up: ${new Date(att.pickupTime).toLocaleTimeString()}`;
  if (att.dropTime) status += `${status ? '<br>' : ''}Dropped: ${new Date(att.dropTime).toLocaleTimeString()}`;
  return status;
}

async function sendParentBusEmail(student, bus, type) {
  if (!student.parentEmail) return false;
  try {
    const res = await fetch(`${getApiBase()}/send-bus-notification-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent_email: student.parentEmail,
        student_name: student.name,
        type,
        bus_number: bus.number,
        timestamp: new Date().toLocaleString(),
      }),
    });
    const data = await res.json().catch(() => ({}));
    return res.ok && data.status === 'sent';
  } catch (e) {
    console.warn('Email send failed:', e);
    return false;
  }
}

async function handleLogout() {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
  await logout();
}

function renderLogin(error = '') {
  mainDiv.innerHTML = `
    <form class="login-form" id="login-form">
      <input type="email" id="email" placeholder="Email" required />
      <input type="password" id="password" placeholder="Password" required />
      <button type="submit">Login</button>
      ${error ? `<div class="error">${error}</div>` : ''}
    </form>
  `;
  document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      renderLogin('Invalid email or password.');
    }
  };
}

async function renderDashboard(user) {
  const profile = await loadUserProfile(user);
  if (!profile) {
    mainDiv.innerHTML = `<div class="error">Driver profile not found. Ask admin to recreate your account from Users → Add New User.</div><button class="logout-btn" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => { handleLogout(); };
    return;
  }
  if ((profile.role || '').trim().toLowerCase() !== 'driver') {
    mainDiv.innerHTML = `<div class="error">This account is not a driver (role: ${profile.role || 'unknown'}).</div><button class="logout-btn" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => { handleLogout(); };
    return;
  }
  const driver = profile;
  // Fetch bus info
  const busSnap = await getDocs(query(collection(db, 'buses'), where('driverId', '==', user.uid)));
  if (busSnap.empty) {
    mainDiv.innerHTML = `<div class="error">No bus assigned to you. Ask your school admin to open <strong>Admin → Buses &amp; Routes</strong> and assign you to a bus.</div><button class="logout-btn" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => { handleLogout(); };
    return;
  }
  const busDoc = busSnap.docs[0];
  const bus = { id: busDoc.id, ...busDoc.data() };
  let students = [];
  if (Array.isArray(bus.students) && bus.students.length > 0) {
    students = bus.students.map(s => ({
      id: s.id,
      name: s.name || s.id,
      parentEmail: s.parentEmail || '',
    }));
  }
  mainDiv.innerHTML = `
    <div class="bus-info"><b>Bus:</b> ${bus.number || ''} <br><b>Route:</b> ${bus.route || ''}</div>
    <div class="student-list">
      ${students.length === 0 ? '<div>No students assigned to this bus.</div>' : students.map(s => `
        <div class="student-row" id="student-${s.id}">
          <span class="student-name">${s.name}</span>
          <span class="status-btns">
            <button class="picked-btn" data-id="${s.id}">Picked Up</button>
            <button class="dropped-btn" data-id="${s.id}">Dropped</button>
          </span>
          <span class="timestamp" id="timestamp-${s.id}"></span>
        </div>
      `).join('')}
    </div>
    <button class="logout-btn" id="logout-btn">Logout</button>
  `;
  document.getElementById('logout-btn').onclick = () => { handleLogout(); };
  // Attach event listeners for attendance
  students.forEach(s => {
    document.querySelector(`#student-${s.id} .picked-btn`).onclick = () => markAttendance(bus, s, 'picked');
    document.querySelector(`#student-${s.id} .dropped-btn`).onclick = () => markAttendance(bus, s, 'dropped');
    loadLastStatus(bus, s);
  });
}

async function saveBusAttendance(bus, student, type, today) {
  const driverId = auth.currentUser?.uid || bus.driverId;
  const attRef = doc(db, 'bus_attendance', `${bus.number}_${student.id}_${today}`);
  const update = {
    busNumber: bus.number,
    studentId: student.id,
    driverId,
    date: today,
  };
  if (type === 'picked') update.pickupTime = new Date().toISOString();
  else update.dropTime = new Date().toISOString();

  try {
    await setDoc(attRef, update, { merge: true });
    return { usedApi: false, update };
  } catch (clientErr) {
    console.warn('Client bus attendance save failed, trying API:', clientErr);
    const token = await getAuthToken();
    if (!token) throw clientErr;
    const res = await fetch(`${getApiBase()}/api/driver/bus-attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        busNumber: bus.number,
        studentId: student.id,
        type,
        date: today,
        parentEmail: student.parentEmail || '',
        studentName: student.name || '',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || clientErr.message);
    return { usedApi: true, update };
  }
}

async function notifyParentBusEvent(bus, student, type) {
  if (!student.parentEmail) return;
  let notifTitle = '';
  let notifMsg = '';
  if (type === 'picked') {
    notifTitle = 'Bus Pickup Notification';
    notifMsg = `${student.name} has been picked up by the bus.`;
  } else if (type === 'dropped') {
    notifTitle = 'Bus Drop Notification';
    notifMsg = `${student.name} has been dropped off by the bus.`;
  }
  try {
    await addDoc(collection(db, 'notifications'), {
      title: notifTitle,
      message: notifMsg,
      recipientEmail: student.parentEmail,
      recipientRole: 'parent',
      studentId: student.id,
      timestamp: Date.now(),
      busNumber: bus.number,
    });
  } catch (e) {
    console.warn('In-app notification failed (parent may still get email):', e);
  }
}

async function markAttendance(bus, student, type) {
  const tsEl = document.getElementById(`timestamp-${student.id}`);
  if (tsEl) tsEl.textContent = 'Saving...';
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { usedApi } = await saveBusAttendance(bus, student, type, today);

    if (!usedApi) {
      await notifyParentBusEvent(bus, student, type);
    }

    let emailSent = false;
    if (student.parentEmail) {
      emailSent = await sendParentBusEmail(student, bus, type);
    }

    await loadLastStatus(bus, student);
    if (tsEl && !student.parentEmail) {
      const existing = tsEl.innerHTML;
      if (existing) tsEl.innerHTML = existing + '<br><span style="color:#888">No parent email on file</span>';
    } else if (tsEl && student.parentEmail) {
      const existing = tsEl.innerHTML;
      const emailNote = emailSent
        ? '<br><span style="color:#4caf50">Parent notified by email</span>'
        : '<br><span style="color:#888">In-app notification saved (email not configured)</span>';
      if (!existing.includes('Parent notified')) tsEl.innerHTML = existing + emailNote;
    }
  } catch (e) {
    console.error(e);
    if (tsEl) tsEl.innerHTML = `<span class="error">Failed: ${e.message || 'permission error'}</span>`;
  }
}

async function loadLastStatus(bus, student) {
  const today = new Date().toISOString().slice(0, 10);
  const tsEl = document.getElementById(`timestamp-${student.id}`);
  if (!tsEl) return;
  let att = null;
  try {
    const attRef = doc(db, 'bus_attendance', `${bus.number}_${student.id}_${today}`);
    const snap = await getDoc(attRef);
    if (snap.exists()) att = snap.data();
  } catch (e) {
    console.warn('Client load status failed, trying API:', e);
    const token = await getAuthToken();
    if (token) {
      const qs = new URLSearchParams({
        busNumber: bus.number,
        studentId: student.id,
        date: today,
      });
      const res = await fetch(`${getApiBase()}/api/driver/bus-attendance?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.record) att = data.record;
    }
  }
  tsEl.innerHTML = formatBusStatus(att);
}

async function startBusLocationTracking(bus, driver) {
  if (!navigator.geolocation) return;
  function updateLocation() {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      // Update bus document in Firestore
      await setDoc(doc(db, 'buses', bus.id), {
        ...bus,
        latitude: lat,
        longitude: lng
      }, { merge: true });
    });
  }
  updateLocation(); // Initial
  return setInterval(updateLocation, 30000); // Every 30 seconds
}

// 1. Add Notifications button to sidebar and section rendering
// 2. Add showNotifications function
function renderSidebar() {
  return `
    <nav id="sidebar">
      <h2>Bus Driver Portal</h2>
      <ul>
        <li><button class="nav-btn" id="nav-dashboard">Dashboard</button></li>
        <li><button class="nav-btn" id="nav-notifications">Notifications</button></li>
        <li><button class="nav-btn logout-btn" id="logout-btn">Logout</button></li>
      </ul>
    </nav>
  `;
}

async function showNotifications() {
  const mainDiv = document.getElementById('driver-main');
  mainDiv.style.maxWidth = '720px';
  mainDiv.innerHTML = renderNotificationsLoading('Notifications');
  try {
    const notifications = await fetchNotificationsForRoles(db, {
      collection,
      query,
      where,
      getDocs,
    }, ['driver', 'all']);
    mainDiv.innerHTML = renderNotificationsPage({
      pageTitle: 'Notifications',
      pageSubtitle: 'Route updates and messages for bus drivers.',
      notifications,
      emptyTitle: 'No notifications',
      emptyMessage: 'New messages from the school will appear here.',
    });
  } catch (e) {
    console.error(e);
    mainDiv.innerHTML = renderNotificationsError(
      'Notifications',
      e.message || 'Error loading notifications.'
    );
  }
}

// Use role-based authentication
onAuthChange(renderPortal, 'driver');

function renderPortal(user) {
  if (user) {
    renderDashboard(user);
  } else {
    renderLogin();
  }
} 