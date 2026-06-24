// Driver Portal JS
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, query, where, getDocs, setDoc, doc, updateDoc, serverTimestamp, getDoc, addDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from '../common/firebase-init.js';
import { getApiBase } from '../common/config.js';
import {
  fetchNotificationsForRoles,
  renderNotificationsPage,
  renderNotificationsLoading,
  renderNotificationsError,
} from '../common/notifications-ui.js';

const auth = getAuth(app);
const db = getFirestore(app);
const mainDiv = document.getElementById('driver-main');

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
    document.getElementById('logout-btn').onclick = () => signOut(auth);
    return;
  }
  if ((profile.role || '').trim().toLowerCase() !== 'driver') {
    mainDiv.innerHTML = `<div class="error">This account is not a driver (role: ${profile.role || 'unknown'}).</div><button class="logout-btn" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => signOut(auth);
    return;
  }
  const driver = profile;
  // Fetch bus info
  const busSnap = await getDocs(query(collection(db, 'buses'), where('driverId', '==', user.uid)));
  if (busSnap.empty) {
    mainDiv.innerHTML = `<div class="error">No bus assigned to you.</div><button class="logout-btn" id="logout-btn">Logout</button>`;
    document.getElementById('logout-btn').onclick = () => signOut(auth);
    return;
  }
  const bus = busSnap.docs[0].data();
  // Fetch students assigned to this bus
  let students = [];
  if (bus.studentIds && bus.studentIds.length > 0) {
    const studentQuery = query(collection(db, 'students'), where('__name__', 'in', bus.studentIds));
    const studentsSnap = await getDocs(studentQuery);
    students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
  document.getElementById('logout-btn').onclick = () => {
    if (locationInterval) clearInterval(locationInterval);
    signOut(auth);
  };
  // Attach event listeners for attendance
  students.forEach(s => {
    document.querySelector(`#student-${s.id} .picked-btn`).onclick = () => markAttendance(bus, s, 'picked');
    document.querySelector(`#student-${s.id} .dropped-btn`).onclick = () => markAttendance(bus, s, 'dropped');
    // Optionally, load and show last status/timestamp
    loadLastStatus(bus, s);
  });
}

async function markAttendance(bus, student, type) {
  const today = new Date().toISOString().slice(0, 10);
  const attRef = doc(db, 'bus_attendance', `${bus.number}_${student.id}_${today}`);
  let update = {};
  if (type === 'picked') update.pickupTime = new Date().toISOString();
  if (type === 'dropped') update.dropTime = new Date().toISOString();
  update.busNumber = bus.number;
  update.studentId = student.id;
  update.driverId = bus.driverId;
  update.date = today;
  await setDoc(attRef, update, { merge: true });

  // Send notification to parent
  // Fetch parent email from student record
  const stuDoc = await getDoc(doc(db, 'students', student.id));
  if (stuDoc.exists()) {
    const s = stuDoc.data();
    if (s.parentEmail) {
      let notifTitle = '';
      let notifMsg = '';
      if (type === 'picked') {
        notifTitle = 'Bus Pickup Notification';
        notifMsg = `${s.name} has been picked up by the bus.`;
      } else if (type === 'dropped') {
        notifTitle = 'Bus Drop Notification';
        notifMsg = `${s.name} has been dropped off by the bus.`;
      }
      await addDoc(collection(db, 'notifications'), {
        title: notifTitle,
        message: notifMsg,
        recipientEmail: s.parentEmail,
        recipientRole: 'parent',
        studentId: student.id,
        timestamp: Date.now(),
        busNumber: bus.number
      });
      // Send email to parent as well
      fetch(`${getApiBase()}/send-bus-notification-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_email: s.parentEmail,
          student_name: s.name,
          type: type, // 'picked' or 'dropped'
          bus_number: bus.number,
          timestamp: new Date().toLocaleString()
        })
      });
    }
  }

  loadLastStatus(bus, student);
}

async function loadLastStatus(bus, student) {
  const today = new Date().toISOString().slice(0, 10);
  const attSnap = await getDocs(query(collection(db, 'bus_attendance'), where('busNumber', '==', bus.number), where('studentId', '==', student.id), where('date', '==', today)));
  let status = '';
  if (!attSnap.empty) {
    const att = attSnap.docs[0].data();
    if (att.pickupTime) status += `Picked Up: ${new Date(att.pickupTime).toLocaleTimeString()}`;
    if (att.dropTime) status += `<br>Dropped: ${new Date(att.dropTime).toLocaleTimeString()}`;
  }
  document.getElementById(`timestamp-${student.id}`).innerHTML = status;
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

import { onAuthChange, logout, loadUserProfile } from '../common/auth.js';

// Use role-based authentication
onAuthChange(renderPortal, 'driver');

function renderPortal(user) {
  if (user) {
    renderDashboard(user);
  } else {
    renderLogin();
  }
} 