// app/sourcing/NouvelAgent/page.js
'use client';

import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebaseClient';
import NouvelAgentWizard from '../../../components/sourcing/NouvelAgentWizard';

/*
  Route publique : /sourcing/NouvelAgent
  Lance le formulaire "Devenir agent sourcing FriTok" (composants/sourcing/
  NouvelAgentWizard.jsx). On écoute simplement onAuthStateChanged pour
  récupérer l'utilisateur FriTok déjà connecté (le wizard exige un compte
  existant — il n'y a pas d'inscription dédiée ici) et on transmet l'objet
  authUser tel quel : le wizard lit authUser.uid / phoneNumber / email /
  emailVerified / getIdToken() directement dessus.
*/

export default function NouvelAgentPage() {
  const [authUser, setAuthUser] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setChecking(false);
    });
    return () => unsub();
  }, []);

  if (checking) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#ffffff70' }}>Chargement…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0E0B08', paddingBottom: 60 }}>
      <NouvelAgentWizard authUser={authUser} />
    </div>
  );
}