
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { logger } from './logger'; // Import the logger
// import { getAuth } from 'firebase/auth'; // We can add this later if we implement Firebase Auth
// We are removing Firebase Storage for now to avoid needing a paid plan.
// import { getStorage } from 'firebase/storage';

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
if (process.env.NODE_ENV === 'development') {
    logger.debug('Firebase Config Being Used:', {
        apiKey: firebaseConfig.apiKey ? '***' : undefined, // Mask API key
        authDomain: firebaseConfig.authDomain,
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
        messagingSenderId: firebaseConfig.messagingSenderId,
        appId: firebaseConfig.appId ? '***' : undefined, // Mask App ID
        measurementId: firebaseConfig.measurementId
    });
}

// Initialize Firebase
let app;

if (!firebaseConfig.projectId) {
  const errorMessage = "CRITICAL Firebase Setup Error: NEXT_PUBLIC_FIREBASE_PROJECT_ID is not defined. Check your .env file or environment variables. The application cannot connect to Firebase without a Project ID.";
  logger.error(errorMessage);
  // Throw an error immediately to stop further execution if projectId is missing.
  // This gives a clearer indication than a downstream Firestore connection error.
  throw new Error(errorMessage);
}

if (!getApps().length) {
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
// const storage = getStorage(app); // For later, removed for now

export { db /*, auth */ }; // Removed storage export
