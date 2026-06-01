import { getAuth, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { app } from './firebase-init.js';

const auth = getAuth(app);
const form = document.getElementById('forgot-password-form');
const resetMessage = document.getElementById('reset-message');

function showMessage(message, isError = false) {
  resetMessage.textContent = message;
  resetMessage.style.color = isError ? 'red' : 'green';
  resetMessage.style.display = 'block';
}

form.onsubmit = async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('reset-email').value.trim();
  
  if (!email) {
    showMessage('Please enter your email address.', true);
    return;
  }

  try {
    showMessage('Sending reset link...', false);
    
    await sendPasswordResetEmail(auth, email);
    showMessage('Password reset link sent! Check your email inbox.', false);
    
    // Clear the form
    form.reset();
    
  } catch (error) {
    console.error('Password reset error:', error);
    
    let errorMessage = 'Failed to send reset link. Please try again.';
    
    switch (error.code) {
      case 'auth/user-not-found':
        errorMessage = 'No account found with this email address.';
        break;
      case 'auth/invalid-email':
        errorMessage = 'Please enter a valid email address.';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Too many requests. Please try again later.';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Network error. Please check your connection.';
        break;
    }
    
    showMessage(errorMessage, true);
  }
};
