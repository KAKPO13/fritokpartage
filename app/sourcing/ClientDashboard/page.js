// app/sourcing/ClientDashboard/page.js
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebaseClient';
import SourcingClientTracker from '../../../components/sourcing/SourcingClientTracker';

/*
  Page hôte de components/sourcing/SourcingClientTracker.jsx.
  Ne gère que l'état d'authentification Firebase (authUser) — le
  composant lui-même filtre déjà les sourcing_requests par
  userId == authUser.uid en interne via onSnapshot.
*/

export default function ClientDashboardPage() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  if (authLoading) {
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
          Connectez-vous pour suivre vos demandes de sourcing.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <SourcingClientTracker authUser={authUser} />
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