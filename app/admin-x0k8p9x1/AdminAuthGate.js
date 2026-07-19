// app/admin-x0k8p9x1/AdminAuthGate.js
'use client';

import { usePathname } from 'next/navigation';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { AdminContext } from '@/lib/adminContext';

const C = { bg: '#0d0d0d', text: '#fff', muted: 'rgba(255,255,255,0.55)', orange: '#ff4d00' };

export default function AdminAuthGate({ children }) {
  const pathname = usePathname();
  const { authUser, isAdmin, ready } = useAdminAuth();

  // La page de connexion elle-même ne doit jamais être bloquée par ce garde-fou
  // — sinon personne ne peut jamais se connecter (c'était le bug ici).
  const estPageLogin = pathname?.endsWith('/login');
  if (estPageLogin) {
    return <div style={{ background: C.bg, minHeight: '100vh' }}>{children}</div>;
  }

  if (!ready) {
    return <div style={{ background: C.bg, minHeight: '100vh' }} />;
  }

  if (!authUser) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: 'system-ui' }}>
        <p style={{ color: C.muted }}>Connexion requise pour accéder à l'espace admin.</p>
        <a href="login" style={{ background: C.orange, color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
          Se connecter
        </a>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ background: C.bg, color: C.text, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        Accès réservé aux administrateurs FriTok.
      </div>
    );
  }

  return (
    <AdminContext.Provider value={{ authUser, isAdmin, ready }}>
      <div style={{ background: C.bg, minHeight: '100vh' }}>{children}</div>
    </AdminContext.Provider>
  );
}