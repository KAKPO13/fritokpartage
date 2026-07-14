'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebaseClient';
import MultiLiveFeedPage from './MultiLiveFeedPage';

// ─────────────────────────────────────────────
// Point d'entrée de la route /live-avatars/Multilivefeedpage.
// Sans ce fichier, le dossier n'est qu'un emplacement de composants —
// Next.js (app router) ne le transforme en route que s'il contient un
// `page.js` exporté par défaut.
//
// `viewerId` est dérivé de l'utilisateur Firebase courant (uid). Il n'est
// plus utilisé pour les écritures (voir avatar-viewer-track côté
// UltraLivePage), donc null pendant la résolution de l'auth n'est pas
// bloquant — MultiLiveFeedPage gère lui-même son propre état "pas
// connecté" via onAuthStateChanged.
// ─────────────────────────────────────────────
export default function Page() {
  const [viewerId, setViewerId] = useState(null);
  const [isTabActive, setIsTabActive] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setViewerId(user?.uid ?? null));
    return unsub;
  }, []);

  // Coupe/relance les lives quand l'utilisateur quitte l'onglet — même
  // rôle que `isActive` côté go_live_page.dart au changement de vue.
  useEffect(() => {
    const onVisibility = () => setIsTabActive(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return <MultiLiveFeedPage viewerId={viewerId} isActive={isTabActive} />;
}