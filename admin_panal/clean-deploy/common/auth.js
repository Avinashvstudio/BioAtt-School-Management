import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { app } from './firebase-init.js';

const auth = getAuth(app);

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
    // Re-attach event listener to new link
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

export function onAuthChange(callback) {
  onAuthStateChanged(auth, callback);
}

export function logout() {
  signOut(auth);
} 