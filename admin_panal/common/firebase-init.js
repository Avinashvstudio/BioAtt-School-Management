// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCMQaE7JBQB8L86E0OfHC864UDHSLMyr7g",
  authDomain: "bioatt-attendance-25d06.firebaseapp.com",
  projectId: "bioatt-attendance-25d06",
  storageBucket: "bioatt-attendance-25d06.firebasestorage.app",
  messagingSenderId: "576873922681",
  appId: "1:576873922681:web:2ce9ce15477da91acad4a8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export { app }; 