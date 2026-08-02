// hooks/useUserRoles.js
'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebaseClient';

/*
  Modèle de rôles — doc `users/{uid}` :

    role    : 'client' | 'vendeur'   → rôle principal du compte
    isAgent : boolean                → un VENDEUR peut EN PLUS être agent
                                        sourcing. Un client ne l'est jamais.

  Important : "vendeur" ne veut PAS dire "agent". Tous les vendeurs
  démarrent avec isAgent=false ; l'activation est un choix explicite
  (ex: validation manuelle côté admin) et non un effet automatique
  du rôle "vendeur".
*/
export function useUserRoles(authUser) {
  const [state, setState] = useState({ role: null, isAgent: false, ready: false });

  useEffect(() => {
    if (!authUser?.uid) {
      setState({ role: null, isAgent: false, ready: true });
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'users', authUser.uid),
      snap => {
        const data = snap.data() || {};
        setState({
          role: data.role || 'client',
          isAgent: data.isAgent === true,
          ready: true,
        });
      },
      () => setState({ role: 'client', isAgent: false, ready: true })
    );
    return unsub;
  }, [authUser?.uid]);

  return state; // { role, isAgent, ready }
}