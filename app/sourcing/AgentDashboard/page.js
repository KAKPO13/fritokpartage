// app/sourcing/AgentDashboard/page.js
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../lib/firebaseClient';
import SourcingAgentDashboard from '../../../components/sourcing/SourcingAgentDashboard';

/*
  Page hôte de components/sourcing/SourcingAgentDashboard.jsx.

  Gère ici ce que le composant ne gère pas lui-même :
    1. L'état d'authentification Firebase (authUser)
    2. Le rôle "agent" (isAgent), lu sur users/{uid}.isAgent

  ⚠️ Hypothèse : le flag isAgent vit sur le document users/{uid}.
  Si dans ton schéma réel il est ailleurs (collection dédiée, custom
  claim, hooks/useUserRoles.js déjà en place ailleurs dans l'app),
  remplace uniquement le second useEffect ci-dessous — le reste de la
  page n'a pas besoin de changer.
*/

export default function AgentDashboardPage() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [isAgent, setIsAgent] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  // ── 1. Écoute l'état de connexion Firebase ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
      if (!user) {
        setIsAgent(false);
        setRoleLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── 2. Écoute le rôle agent une fois l'utilisateur connu ──
  useEffect(() => {
    if (!authUser?.uid) return;
    setRoleLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        setIsAgent(snap.exists() ? !!snap.data().isAgent : false);
        setRoleLoading(false);
      },
      () => setRoleLoading(false)
    );
    return unsub;
  }, [authUser?.uid]);

  // ── États d'affichage ──
  if (authLoading || (authUser && roleLoading)) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.messageText}>Chargement…</p>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.messageText}>
          Connectez-vous pour accéder à votre tableau de bord agent sourcing.
        </p>
      </div>
    );
  }

  if (!isAgent) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.messageText}>
          Cette page est réservée aux agents sourcing. Si vous pensez qu'il
          s'agit d'une erreur, contactez le support FriTok.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <SourcingAgentDashboard authUser={authUser} isAgent={isAgent} />
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
  },
  centerScreen: {
    minHeight: '60vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    textAlign: 'center',
  },
  messageText: {
    color: '#ffffff90',
    fontSize: 14,
    maxWidth: 320,
    lineHeight: 1.5,
  },
};