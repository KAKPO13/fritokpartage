// lib/useAdminAuth.js
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseClient';

export function useAdminAuth() {
  const [authUser, setAuthUser] = useState(null);
  const [isAdmin, setIsAdmin]   = useState(null);
  const [ready, setReady]       = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (!user) { setIsAdmin(false); setReady(true); return; }

      // true = force le rafraîchissement du token auprès de Firebase au lieu
      // de lire le cache local — évite exactement le piège "claim posé après
      // connexion, token périmé affiche encore isAdmin: false".
      const tokenResult = await user.getIdTokenResult(true);
      setIsAdmin(!!tokenResult.claims.admin);
      setReady(true);
    });
  }, []);

  return { authUser, isAdmin, ready };
}