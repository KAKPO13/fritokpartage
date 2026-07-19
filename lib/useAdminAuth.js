// lib/useAdminAuth.js
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseClient';

export function useAdminAuth() {
  const [authUser, setAuthUser] = useState(null);
  const [isAdmin, setIsAdmin]   = useState(null); // null = en vérification
  const [ready, setReady]       = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) { setIsAdmin(false); setReady(true); return; }
      const tokenResult = await user.getIdTokenResult();
      setIsAdmin(!!tokenResult.claims.admin);
      setReady(true);
    });
  }, []);

  return { authUser, isAdmin, ready };
}