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
    3. Le profil opérationnel de l'agent, lu sur agent_local_fritok/{uid}
       (isActive, verified) — l'accès au dashboard exige les trois.

  ⚠️ Convention attendue : agent_local_fritok utilise le uid Firebase
  comme ID de document (même pattern que users/{uid}), pas un ID
  auto-généré. Si un profil existant a été créé avec un ID différent,
  il faut le migrer (relire l'ancien doc, le réécrire sous
  doc(db, 'agent_local_fritok', uid), supprimer l'ancien) avant qu'il
  ne soit visible ici.
*/

export default function AgentDashboardPage() {
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [isAgentFlag, setIsAgentFlag] = useState(false);
  const [flagLoading, setFlagLoading] = useState(true);

  const [agentProfile, setAgentProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── 1. Écoute l'état de connexion Firebase ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthLoading(false);
      if (!user) {
        setIsAgentFlag(false);
        setFlagLoading(false);
        setAgentProfile(null);
        setProfileLoading(false);
      }
    });
    return unsub;
  }, []);

  // ── 2. Écoute le flag isAgent sur users/{uid} ──
  useEffect(() => {
    if (!authUser?.uid) return;
    setFlagLoading(true);
    const unsub = onSnapshot(
      doc(db, 'users', authUser.uid),
      (snap) => {
        setIsAgentFlag(snap.exists() ? !!snap.data().isAgent : false);
        setFlagLoading(false);
      },
      () => setFlagLoading(false)
    );
    return unsub;
  }, [authUser?.uid]);

  // ── 3. Écoute le profil opérationnel sur agent_local_fritok/{uid} ──
  useEffect(() => {
    if (!authUser?.uid) return;
    setProfileLoading(true);
    const unsub = onSnapshot(
      doc(db, 'agent_local_fritok', authUser.uid),
      (snap) => {
        setAgentProfile(snap.exists() ? snap.data() : null);
        setProfileLoading(false);
      },
      () => setProfileLoading(false)
    );
    return unsub;
  }, [authUser?.uid]);

  const isAgentActif = isAgentFlag && !!agentProfile?.isActive && !!agentProfile?.verified;

  // ── États d'affichage ──
  if (authLoading || (authUser && (flagLoading || profileLoading))) {
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

  if (!isAgentFlag || !agentProfile) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.messageText}>
          Cette page est réservée aux agents sourcing. Si vous pensez qu'il
          s'agit d'une erreur, contactez le support FriTok.
        </p>
      </div>
    );
  }

  if (!agentProfile.isActive || !agentProfile.verified) {
    return (
      <div style={styles.centerScreen}>
        <p style={styles.messageText}>
          Votre profil agent sourcing est en attente de validation. Vous
          recevrez une notification dès qu'il sera activé.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <SourcingAgentDashboard authUser={authUser} isAgent={isAgentActif} />
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