import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from './firebase-init.js';
import { getApiBase } from './config.js';

const auth = getAuth(app);
const db = getFirestore(app);
let persistenceInitialized = false;

async function ensureSessionPersistence() {
  if (persistenceInitialized) return;
  await setPersistence(auth, browserSessionPersistence);
  persistenceInitialized = true;
}

const authContainer = document.getElementById('auth-container');
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubmit = document.getElementById('auth-submit');
const authToggleText = document.getElementById('auth-toggle-text');
const authToggleLink = document.getElementById('auth-toggle-link');
const authError = document.getElementById('auth-error');

let isLogin = true;

if (authToggleLink) {
  authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isLogin = !isLogin;
    authTitle.textContent = isLogin ? 'Login' : 'Sign Up';
    authSubmit.textContent = isLogin ? 'Login' : 'Sign Up';
    authToggleText.innerHTML = isLogin
      ? "Don't have an account? <a href='#' id='auth-toggle-link'>Sign up</a>"
      : "Already have an account? <a href='#' id='auth-toggle-link'>Login</a>";
    authError.textContent = '';
    document.getElementById('auth-toggle-link').addEventListener('click', arguments.callee);
  });
}

if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    authError.textContent = '';
    try {
      await ensureSessionPersistence();
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      authError.textContent = error.message;
    }
  });
}

function redirectUnauthorized(reason, detail = '') {
  const params = new URLSearchParams({ reason });
  if (detail) params.set('detail', detail);
  window.location.href = `../common/unauthorized.html?${params.toString()}`;
}

export async function loadUserProfile(user) {
  if (!user) return null;

  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.exists()) return userDoc.data();
  } catch (error) {
    console.warn('Firestore profile read failed, trying API:', error);
  }

  try {
    const token = await user.getIdToken();
    const res = await fetch(`${getApiBase()}/api/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.profile) return data.profile;
    console.warn('API profile:', data.error || res.status);
  } catch (error) {
    console.warn('API profile fetch failed:', error);
  }

  return null;
}

export function onAuthChange(callback, requiredRole = null) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('User authenticated:', user.email);

      if (requiredRole) {
        try {
          const userData = await loadUserProfile(user);
          if (!userData) {
            console.log('User document not found for uid', user.uid);
            redirectUnauthorized('missing_profile', user.email || '');
            return;
          }

          const actualRole = (userData.role || '').trim().toLowerCase();
          const expectedRole = String(requiredRole).trim().toLowerCase();
          if (actualRole === expectedRole) {
            console.log('Role verified:', userData.role);
            callback(user);
          } else {
            console.log('Access denied: role', userData.role, 'expected', requiredRole);
            redirectUnauthorized('wrong_role', `${userData.role || 'unknown'} → need ${requiredRole}`);
          }
        } catch (error) {
          console.error('Error verifying role:', error);
          redirectUnauthorized('error', error.message || '');
        }
      } else {
        callback(user);
      }
    } else {
      console.log('User not authenticated');
      callback(null);
    }
  });
}

export async function logout() {
  try {
    await signOut(auth);
    console.log('User signed out successfully');
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
}
