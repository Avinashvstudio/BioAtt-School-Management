import { getAuth, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getFirestore, collection, setDoc, doc, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { app } from './firebase-init.js';

const auth = getAuth(app);
const db = getFirestore(app);

const form = document.getElementById('signup-form');
const errorDiv = document.getElementById('signup-error');

form.onsubmit = async (e) => {
  e.preventDefault();
  errorDiv.textContent = '';
  const schoolId = document.getElementById('signup-school-id').value.trim();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;
  try {
    // Prevent duplicate schoolId+email
    const q = query(collection(db, 'users'), where('email', '==', email), where('schoolId', '==', schoolId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      errorDiv.textContent = 'User with this email and school ID already exists.';
      return;
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, 'users', cred.user.uid), { name, email, role, schoolId });
    // Redirect to login page
    window.location.href = 'login.html';
  } catch (err) {
    errorDiv.textContent = err.message;
  }
}; 