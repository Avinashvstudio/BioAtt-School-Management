import { getAuth, signInWithEmailAndPassword, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from './firebase-init.js';

const auth = getAuth(app);
const db = getFirestore(app);

let persistenceInitialized = false;

async function ensureSessionPersistence() {
  if (persistenceInitialized) return;
  await setPersistence(auth, browserSessionPersistence);
  persistenceInitialized = true;
}

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing login form...');
  
  const form = document.getElementById('login-form');
  const errorDiv = document.getElementById('login-error');
  
  if (!form) {
    console.error('Login form not found!');
    return;
  }
  
  if (!errorDiv) {
    console.error('Error div not found!');
    return;
  }
  
  console.log('Login form elements found, setting up event listener...');
  
  // Set up form submission handler
  form.addEventListener('submit', handleLogin);
});

async function handleLogin(e) {
  e.preventDefault();
  console.log('Login form submitted');
  
  const errorDiv = document.getElementById('login-error');
  errorDiv.textContent = '';
  
  let email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  console.log('Attempting login for email:', email);
  
  if (!email || !password) {
    showError('Please enter both email and password');
    return;
  }
  
  email = email.toLowerCase(); // Always lowercase email for lookup
  
  try {
    await ensureSessionPersistence();
    console.log('Starting Firebase authentication...');
    
    // First authenticate with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    console.log('Firebase Auth successful for user:', user.email);
    console.log('User UID:', user.uid);
    
    // Fetch user doc from Firestore using the user's UID (more reliable)
    console.log('Fetching user document from Firestore...');
    const userDocRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userDocRef);
    
    if (!userSnap.exists()) {
      console.error('No user profile found in Firestore');
      showError('User profile not found. Please contact administrator.');
      return;
    }
    
    const userData = userSnap.data();
    console.log('User data from Firestore:', userData);
    console.log('User role:', userData.role);
    
    // Store user info in sessionStorage so each tab can keep its own account.
    try {
      console.log('Storing user session...');
      const userSession = {
        uid: user.uid,
        email: user.email,
        role: userData.role,
        loginTime: Date.now()
      };
      sessionStorage.setItem('currentUser', JSON.stringify(userSession));
      console.log('Session stored successfully');
    } catch (sessionError) {
      console.error('Session storage error:', sessionError);
      // Continue with login even if session fails
    }
    
    const role = (userData.role || '').trim().toLowerCase();
    console.log('Redirecting based on role:', role);

    if (role === 'admin') {
      window.location.href = '/admin_panal/admin/index.html';
    } else if (role === 'teacher') {
      window.location.href = '/admin_panal/teacher/index.html';
    } else if (role === 'parent') {
      window.location.href = '/admin_panal/parent/index.html';
    } else if (role === 'driver') {
      window.location.href = '/admin_panal/driver/index.html';
    } else {
      showError('Unknown user role: ' + (userData.role || '(empty)'));
    }
    
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    showError(getFriendlyAuthErrorMessage(error));
  }
}

function showError(msg) {
  let errorDiv = document.getElementById('login-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.id = 'login-error';
    document.querySelector('.auth-container').appendChild(errorDiv);
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