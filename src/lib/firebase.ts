
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { logger } from './logger'; // Import the logger
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

// Log the configuration being used (be mindful of sensitive data in production logs)
// For local development, this is helpful.
if (process.env.NODE_ENV === 'development') {
    logger.debug('Firebase Config Being Used:', firebaseConfig);
}


// Initialize Firebase
let app;
if (!getApps().length) {
  if (!firebaseConfig.projectId) {
    const errorMessage = "Firebase projectId is not defined. Check your .env file and ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set.";
    logger.error(errorMessage);
    // Potentially throw an error or handle this case more gracefully
    // For now, initializing with potentially undefined config will likely lead to Firebase errors downstream.
  }
  try {
    app = initializeApp(firebaseConfig);
    logger.info('Firebase app initialized successfully.');
  } catch (error) {
    logger.error('Firebase app initialization failed:', error);
    // Handle error appropriately, maybe re-throw or exit
    throw error; // Re-throwing so the app doesn't continue with a broken Firebase setup
  }
} else {
  app = getApp();
  logger.info('Existing Firebase app retrieved.');
}

let db: import('firebase/firestore').Firestore;
try {
  db = getFirestore(app);
  logger.info('Firestore instance obtained successfully.');
} catch (error) {
  logger.error('Failed to get Firestore instance:', error);
  // Depending on your app's needs, you might want to throw here too
  // or provide a mock/fallback if Firestore is not critical for all parts
  throw error;
}

// const auth = getAuth(app); // For later
// const storage = getStorage(app); // For later

export { db /*, auth, storage */ };
