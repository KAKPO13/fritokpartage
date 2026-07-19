// app/admin/login/page.js
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebaseClient';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur]     = useState(null);
  const [loading, setLoading]   = useState(false);

  const seConnecter = async () => {
    setErreur(null);
    setLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const tokenResult = await cred.user.getIdTokenResult();
      if (!tokenResult.claims.admin) {
        await auth.signOut();
        throw new Error('Ce compte n\'a pas les droits admin.');
      }
      router.push('/admin-x0k8p9x1');
    } catch (e) {
      setErreur(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#0d0d0d', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 28, width: 320 }}>
        <h1 style={{ color: '#fff', fontSize: 18, marginBottom: 16 }}>Espace admin FriTok</h1>
        <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
        <input type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff' }} />
        {erreur && <p style={{ color: '#ff4520', fontSize: 12, marginBottom: 10 }}>{erreur}</p>}
        <button onClick={seConnecter} disabled={loading}
          style={{ width: '100%', padding: 11, borderRadius: 8, border: 'none', background: '#ff4d00', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
      </div>
    </div>
  );
}