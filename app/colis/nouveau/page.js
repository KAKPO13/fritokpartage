'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../../lib/firebaseClient'; // ⚠️ adapte le chemin si besoin
import AjouterColis from '../../../components/AjouterColis';

export default function NouveauColisPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCheckingAuth(false);
      if (!u) {
        // Redirige vers la connexion si non authentifié
        router.replace('/connexion?next=/colis/nouveau');
      }
    });
    return unsub;
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FFF8F2]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#FFD4A8] border-t-[#FF6B00]" />
      </div>
    );
  }

  if (!user) return null; // redirection en cours

  return (
    <AjouterColis
      onSuccess={() => router.push('/app?tab=colis')}
      onCancel={() => router.back()}
    />
  );
}