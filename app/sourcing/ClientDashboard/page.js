// components/sourcing/SourcingClientTracker.jsx
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';
import {
  SOURCING_ETAPES, labelStatut, couleurStatut,
  labelItemStatut, couleurItemStatut,
} from '../../lib/sourcingStatuts';

/*
  Vue "Client" : liste des sourcing_requests où clientId == uid, avec
  suivi visuel de l'étape en cours. Schéma attendu du doc sourcing_requests
  (à adapter si submit-sourcing-request.js écrit des noms de champs
  différents) :

    clientId, agentId, agentNom, agentVille, agentPays
    items: [{ videoId, titre, image, quantite, prixUnitaire, currency, lienProduit }]
    devis: { sousTotal, feeItems, feePerOrder, commission, shippingToClient, total, currency }
    statut, createdAt, updatedAt
*/

function ProgressTrack({ statut }) {
  if (statut === 'annulee') {
    return <p style={{ color: couleurStatut('annulee'), fontSize: 13, fontWeight: 700, margin: '8px 0 0' }}>Demande annulée</p>;
  }
  if (statut === 'en_attente_paiement') {
    return <p style={{ color: couleurStatut('en_attente_paiement'), fontSize: 13, margin: '8px 0 0' }}>En attente de paiement</p>;
  }

  const activeIdx = statut === 'partiellement_introuvable' ? 0 : SOURCING_ETAPES.indexOf(statut);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '10px 0 4px' }}>
      {SOURCING_ETAPES.map((etape, i) => (
        <div key={etape} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, color: '#fff',
            background: i <= activeIdx ? couleurStatut(etape) : 'rgba(255,255,255,.12)',
          }}>
            {i < activeIdx ? '✓' : i + 1}
          </div>
          {i < SOURCING_ETAPES.length - 1 && (
            <div style={{
              flex: 1, height: 2, margin: '0 2px',
              background: i < activeIdx ? couleurStatut(etape) : 'rgba(255,255,255,.12)',
            }}/>
          )}
        </div>
      ))}
    </div>
  );
}

function DemandeCard({ req }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 14, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>
            Demande #{req.id.slice(0, 8)}
          </p>
          <p style={{ color: '#ffffff70', fontSize: 12, margin: '2px 0 0' }}>
            {req.items?.length ?? 0} article{(req.items?.length ?? 0) > 1 ? 's' : ''}
            {req.agentNom ? ` · Agent : ${req.agentNom}` : ''}
          </p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: couleurStatut(req.statut),
          border: `1px solid ${couleurStatut(req.statut)}`, borderRadius: 8,
          padding: '3px 8px', whiteSpace: 'nowrap',
        }}>
          {labelStatut(req.statut)}
        </span>
      </div>

      <ProgressTrack statut={req.statut}/>

      <button
        onClick={() => setExpanded(e => !e)}
        style={{ background: 'none', border: 'none', color: '#ff4d00', fontSize: 12, cursor: 'pointer', padding: 0, marginTop: 4 }}
      >
        {expanded ? 'Masquer les détails' : 'Voir les détails'}
      </button>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {req.items?.map((it, i) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#ffffff90' }}>
                <span>{it.titre} × {it.quantite}</span>
                <span>{(it.prixUnitaire * it.quantite).toLocaleString('fr-FR')} {it.currency}</span>
              </div>
              {it.statutItem && it.statutItem !== 'a_verifier' && (
                <span style={{
                  fontSize: 10, fontWeight: 700, color: couleurItemStatut(it.statutItem),
                  border: `1px solid ${couleurItemStatut(it.statutItem)}`, borderRadius: 6,
                  padding: '1px 6px', display: 'inline-block', marginTop: 2,
                }}>
                  {labelItemStatut(it.statutItem)}
                </span>
              )}
            </div>
          ))}
          {req.devis && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: 8, paddingTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#fff', fontSize: 13 }}>
                <span>Total</span>
                <span>{req.devis.total?.toLocaleString('fr-FR')} {req.devis.currency}</span>
              </div>
            </div>
          )}
          {req.statut === 'partiellement_introuvable' && (
            <p style={{ color: '#F97316', fontSize: 12, marginTop: 8 }}>
              Certains articles n'ont pas pu être trouvés par l'agent. Il vous contactera pour ajuster la commande.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SourcingClientTracker({ authUser }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!authUser?.uid) { setLoading(false); return; }
    const q = query(
      collection(db, 'sourcing_requests'),
      where('userId', '==', authUser.uid), // champ réel écrit par submit-sourcing-request.js
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser?.uid]);

  if (!authUser) return null;
  if (loading) return <p style={{ color: '#ffffff70', padding: 16 }}>Chargement…</p>;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>Mes demandes sourcing</h2>
      {requests.length === 0 && (
        <p style={{ color: '#ffffff60', fontSize: 13 }}>
          Vous n'avez pas encore de demande de sourcing en cours.
        </p>
      )}
      {requests.map(req => <DemandeCard key={req.id} req={req}/>)}
    </div>
  );
}