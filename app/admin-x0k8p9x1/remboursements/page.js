// app/admin/remboursements/page.js
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/adminContext';

const C = {
  orange: '#ff4d00', orangeSoft: 'rgba(255,77,0,0.08)',
  card: '#161616', border: 'rgba(255,255,255,0.1)',
  text: '#fff', muted: 'rgba(255,255,255,0.55)',
  green: '#34C759', red: '#ff4520',
};

export default function AdminRemboursementsPage() {
  // authUser/isAdmin viennent du layout — plus de onAuthStateChanged ici,
  // cette page ne peut de toute façon jamais se rendre sans admin valide.
  const { authUser } = useAdmin();

  const [demandes, setDemandes] = useState([]);
  const [confirmCible, setConfirmCible] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'sourcing_requests'), where('aRemboursementEnAttente', '==', true));
    return onSnapshot(q, snap => {
      setDemandes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const executerRemboursement = async () => {
    if (!confirmCible) return;
    setExecuting(true);
    setErreur(null);
    try {
      const idToken = await authUser.getIdToken();
      const res = await fetch('/.netlify/functions/admin-execute-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ requestId: confirmCible.requestId, itemIndex: confirmCible.itemIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConfirmCible(null);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setExecuting(false);
    }
  };

  const remboursementsAplati = demandes.flatMap(d =>
    (d.remboursementsEnAttente || [])
      .filter(r => r.statut === 'en_attente_validation')
      .map(r => ({ ...r, requestId: d.id, userId: d.userId, agentId: d.agentId, currency: d.devis.currency }))
  );

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '24px 16px 60px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Remboursements en attente</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 24 }}>
          {remboursementsAplati.length} remboursement{remboursementsAplati.length !== 1 ? 's' : ''} à valider
        </p>

        {remboursementsAplati.length === 0 && (
          <p style={{ color: C.muted, textAlign: 'center', padding: '40px 0' }}>Aucun remboursement en attente.</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {remboursementsAplati.map(r => (
            <div key={`${r.requestId}-${r.itemIndex}`} style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: C.text }}>{r.titre}</p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted }}>
                  Demande #{r.requestId.slice(0, 8)} · Client {r.userId.slice(0, 8)} · Agent {r.agentId.slice(0, 8)}
                </p>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, color: C.orange, fontSize: 15 }}>
                  {r.montant.toLocaleString('fr-FR')} {r.currency}
                </p>
                <button
                  onClick={() => setConfirmCible(r)}
                  style={{
                    marginTop: 6, padding: '6px 14px', borderRadius: 8, border: 'none',
                    background: C.orange, color: '#fff', fontWeight: 600, fontSize: 12.5, cursor: 'pointer',
                  }}>
                  Valider
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {confirmCible && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20,
        }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, maxWidth: 380, width: '100%' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: C.text }}>Confirmer le remboursement</h2>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Vous allez créditer <strong style={{ color: C.text }}>{confirmCible.montant.toLocaleString('fr-FR')} {confirmCible.currency}</strong> sur
              le wallet du client pour « {confirmCible.titre} », en le débitant de l'escrow FriTok. Cette action est irréversible.
            </p>
            {erreur && <p style={{ color: C.red, fontSize: 12.5, marginBottom: 12 }}>{erreur}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setConfirmCible(null); setErreur(null); }} disabled={executing}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: 'transparent', color: C.text, fontWeight: 600, cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={executerRemboursement} disabled={executing}
                style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: C.orange, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {executing ? 'Traitement...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}