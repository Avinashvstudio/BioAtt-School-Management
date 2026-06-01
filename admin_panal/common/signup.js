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
    // First create the Firebase Auth user
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    
    // Then create the user document in Firestore
    await setDoc(doc(db, 'users', cred.user.uid), { 
      name, 
      email: email.toLowerCase(), 
      role, 
      schoolId,
      createdAt: new Date().toISOString()
    });
    
    // Success - redirect to login page
    alert('Account created successfully! Please login.');
    window.location.href = 'login.html';
    
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === 'auth/email-already-in-use') {
      errorDiv.textContent = 'An account with this email already exists.';
    } else if (err.code === 'auth/weak-password') {
      errorDiv.textContent = 'Password should be at least 6 characters.';
    } else {
      errorDiv.textContent = 'Error creating account: ' + err.message;
    }
  }
}; 