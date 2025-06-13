
"use client";

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, type User as FirebaseUserType } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import type { User } from '@/lib/types'; // Our app's User type
import { getUserProfile } from '@/lib/data'; // To fetch user profile from Firestore
import { logger } from '@/lib/logger';

interface AuthContextType {
  currentUser: User | null; // Changed to our User type
  firebaseUser: FirebaseUserType | null; // Keep Firebase user for direct access if needed
  isLoading: boolean;
  error: Error | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUserType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (fbUser) => {
        setFirebaseUser(fbUser);
        if (fbUser) {
          logger.info('[AuthContext] Firebase user detected', { uid: fbUser.uid });
          try {
            const userProfile = await getUserProfile(fbUser.uid);
            if (userProfile) {
              setCurrentUser(userProfile);
              logger.info('[AuthContext] User profile loaded from Firestore', { userProfile });
            } else {
              // This case might happen if profile creation failed or if the user exists in Auth but not in Firestore 'users' collection.
              // We might want to create a profile here or log them out, or show an error.
              // For now, let's set our app user to null and log a warning.
              setCurrentUser(null);
              logger.warn(`[AuthContext] User profile not found in Firestore for UID: ${fbUser.uid}. User might need to complete profile or re-signup.`);
              //setError(new Error("User profile not found. Please contact support or try signing up again."));
            }
          } catch (e) {
            logger.error('[AuthContext] Error fetching user profile:', e);
            setCurrentUser(null);
            setError(e instanceof Error ? e : new Error("Failed to load user profile."));
          }
        } else {
          logger.info('[AuthContext] No Firebase user detected.');
          setCurrentUser(null);
        }
        setIsLoading(false);
      },
      (authError) => {
        logger.error('[AuthContext] Firebase onAuthStateChanged error:', authError);
        setFirebaseUser(null);
        setCurrentUser(null);
        setError(authError);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, firebaseUser, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
