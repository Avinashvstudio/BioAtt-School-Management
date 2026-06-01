import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, query, collection, where } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from './firebase-init.js';

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('login-form');
const errorDiv = document.getElementById('login-error');

function showError(msg) {
  let errorDiv = document.getElementById('login-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.id = 'login-error';
    document.querySelector('.login-form').appendChild(errorDiv);
  }
  errorDiv.textContent = msg;
}

function getFriendlyAuthErrorMessage(error) {
  switch (error.code) {
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    default:
      return 'Login failed. Please try again.';
  }
}

form.onsubmit = async (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  let email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  email = email.toLowerCase(); // Always lowercase email for lookup
  try {
    // After successful sign in, check user role and redirect
    signInWithEmailAndPassword(auth, email, password)
      .then(async (userCredential) => {
        const user = userCredential.user;
        // Fetch user doc from Firestore (use lowercased email)
        const userSnap = await getDocs(query(collection(db, 'users'), where('email', '==', user.email.toLowerCase())));
        if (userSnap.empty) {
          showError('No user profile found.');
          return;
        }
        const userData = userSnap.docs[0].data();
        if (userData.role === 'admin') {
          window.location.href = '/admin_panal/admin/index.html';
        } else if (userData.role === 'teacher') {
          window.location.href = '/admin_panal/teacher/index.html';
        } else if (userData.role === 'parent') {
          window.location.href = '/admin_panal/parent/index.html';
        } else if (userData.role === 'driver') {
          window.location.href = '/admin_panal/driver/index.html';
        } else {
          showError('Unknown user role.');
        }
      })
      .catch((error) => {
        showError('Invalid email or password.');
      });
  } catch (err) {
    errorDiv.textContent = getFriendlyAuthErrorMessage(err);
  }
}; 