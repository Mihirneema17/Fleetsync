
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
// import { getAuth } from 'firebase/auth'; // We can add this later if we implement Firebase Auth
// import { getStorage } from 'firebase/storage'; // We can add this later for file uploads

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// --- TEMPORARY DIAGNOSTIC LOG ---
// Check your server console (where you run `npm run dev`) for this output.
// Ensure all values match your Firebase project settings.
// If values are undefined, your .env file might not be loaded correctly or there's a typo in variable names.
console.log("Firebase Config Being Used:", firebaseConfig);
// --- END TEMPORARY DIAGNOSTIC LOG ---

// Initialize Firebase
let app;
if (!getApps().length) {
  if (!firebaseConfig.projectId) {
    console.error("Firebase projectId is not defined. Check your .env file and ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set.");
    // Potentially throw an error or handle this case more gracefully
    // For now, initializing with potentially undefined config will likely lead to Firebase errors downstream.
  }
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const db = getFirestore(app);
// const auth = getAuth(app); // For later
// const storage = getStorage(app); // For later

export { db /*, auth, storage */ };
