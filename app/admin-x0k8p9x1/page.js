// app/admin-x0k8p9x1/page.js
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/adminContext';

const C = {
  orange: '#ff4d00', orangeSoft: 'rgba(255,77,0,0.08)',
  card: '#161616', border: 'rgba(255,255,255,0.1)',
  text: '#fff', muted: 'rgba(255,255,255,0.55)',
};

export default function AdminHomePage() {
  const { authUser } = useAdmin();
  const [refundCount, setRefundCount] = useState(null);
  const [pendingB2BCount, setPendingB2BCount] = useState(null);

  // Compteur remboursements — même requête que la page dédiée, juste pour
  // afficher un badge ici sans dupliquer toute la logique de traitement.
  useEffect(() => {
    const q = query(collection(db, 'sourcing_requests'), where('aRemboursementEnAttente', '==', true));
    return onSnapshot(q, snap => {
      const total = snap.docs.reduce((sum, d) => {
        const remb = d.data().remboursementsEnAttente || [];
        return sum + remb.filter(r => r.statut === 'en_attente_validation').length;
      }, 0);
      setRefundCount(total);
    });
  }, []);

  // Compteur B2B — lecture ponctuelle suffit ici (pas besoin de temps réel
  // sur la page d'accueil, juste un ordre de grandeur)
  useEffect(() => {
    (async () => {
      const q = query(collection(db, 'users'), where('role', '==', 'Vendeur'), where('b2bSupplier.status', '==', 'pending'));
      const snap = await getDocs(q);
      setPendingB2BCount(snap.size);
    })();
  }, []);

  // Chemins ABSOLUS (avec le / initial) — un lien relatif du type
  // "b2b-verification" sur l'URL "/admin-x0k8p9x1" (sans slash final) se
  // résout en "/b2b-verification" (répertoire parent), pas en
  // "/admin-x0k8p9x1/b2b-verification". D'où le 404 observé avant ce correctif.
  const sections = [
    {
      href: '/admin-x0k8p9x1/remboursements',
      titre: 'Remboursements sourcing',
      description: 'Valider les remboursements liés aux produits introuvables',
      count: refundCount,
    },
    {
      href: '/admin-x0k8p9x1/b2b-verification',
      titre: 'Vérification fournisseurs B2B',
      description: 'Examiner les demandes de statut fournisseur en attente',
      count: pendingB2BCount,
    },
  ];

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '32px 16px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Espace admin FriTok</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 28 }}>
          Connecté en tant que {authUser?.email}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map(s => (
            <a
              key={s.href}
              href={s.href}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                padding: '18px 20px', textDecoration: 'none',
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: C.text }}>{s.titre}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>{s.description}</p>
              </div>
              {s.count !== null && s.count > 0 && (
                <span style={{
                  background: C.orangeSoft, color: C.orange, fontWeight: 700, fontSize: 13,
                  borderRadius: 20, padding: '4px 12px', flexShrink: 0,
                }}>
                  {s.count}
                </span>
              )}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}