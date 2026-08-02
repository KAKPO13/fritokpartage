// components/sourcing/SourcingAgentDashboard.jsx
'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebaseClient';
import {
  TRANSITIONS_AGENT, labelStatut, couleurStatut,
  labelItemStatut, couleurItemStatut,
} from '../../../lib/sourcingStatuts';

/*
  Vue "Agent" — n'est rendue que pour un vendeur avec isAgent === true
  (voir hooks/useUserRoles.js). Un vendeur simple n'a jamais accès à ce
  composant : "vendeur" et "agent" sont deux capacités indépendantes.

  agent-update-sourcing-status.js authentifie désormais par Firebase ID
  token (plus par lien signé WhatsApp) et expose deux actions :
    - 'update_item'   { requestId, itemIndex, statutItem }
    - 'update_statut' { requestId, nouveauStatut }
  Chaque transition écrit en Firestore, qui est reflété ici en direct via
  onSnapshot — pas besoin de rafraîchir manuellement l'état local.
*/

function miniBtnStyle(couleur, disabled) {
  return {
    background: couleur, color: '#fff', border: 'none', borderRadius: 6,
    padding: '4px 10px', fontSize: 11, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .6 : 1,
  };
}

async function appellerFonction(authUser, payload) {
  const idToken = await authUser.getIdToken();
  const res = await fetch('/.netlify/functions/agent-update-sourcing-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Échec de la mise à jour');
  return data;
}

function ItemRow({ req, item, index, authUser }) {
  const [updating, setUpdating] = useState(false);
  const [erreur, setErreur]     = useState(null);
  const peutModifier = ['sourcing_en_cours', 'partiellement_introuvable'].includes(req.statut);

  const majItem = async (statutItem) => {
    setUpdating(true);
    setErreur(null);
    try {
      await appellerFonction(authUser, {
        action: 'update_item',
        requestId: req.id,
        itemIndex: index,
        statutItem,
      });
    } catch (e) {
      setErreur(e.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: '#ffffff90' }}>{item.titre} × {item.quantite}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: couleurItemStatut(item.statutItem),
          border: `1px solid ${couleurItemStatut(item.statutItem)}`, borderRadius: 6,
          padding: '2px 6px', whiteSpace: 'nowrap',
        }}>
          {labelItemStatut(item.statutItem)}
        </span>
      </div>

      {peutModifier && item.statutItem === 'a_verifier' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button disabled={updating} onClick={() => majItem('trouve')} style={miniBtnStyle('#34C759', updating)}>
            Trouvé
          </button>
          <button disabled={updating} onClick={() => majItem('introuvable')} style={miniBtnStyle('#EF4444', updating)}>
            Introuvable
          </button>
        </div>
      )}

      {peutModifier && item.statutItem !== 'a_verifier' && (
        <button
          disabled={updating}
          onClick={() => majItem(item.statutItem === 'trouve' ? 'introuvable' : 'trouve')}
          style={{ ...miniBtnStyle('#6B7280', updating), marginTop: 4 }}
        >
          Modifier
        </button>
      )}

      {erreur && <p style={{ color: '#FCA5A5', fontSize: 11, marginTop: 4 }}>{erreur}</p>}
    </div>
  );
}

function ActionButtons({ req, authUser }) {
  const [updating, setUpdating] = useState(false);
  const [erreur, setErreur]     = useState(null);
  const options = TRANSITIONS_AGENT[req.statut] || [];
  if (options.length === 0) return null;

  const itemsNonTraites = req.items?.some(i => i.statutItem === 'a_verifier');

  const majStatut = async (nouveauStatut) => {
    setUpdating(true);
    setErreur(null);
    try {
      await appellerFonction(authUser, { action: 'update_statut', requestId: req.id, nouveauStatut });
    } catch (e) {
      setErreur(e.message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(next => {
          const bloque = next === 'en_transit' && itemsNonTraites;
          return (
            <button
              key={next}
              disabled={updating || bloque}
              title={bloque ? "Statuez chaque produit avant de passer à l'expédition" : ''}
              onClick={() => majStatut(next)}
              style={miniBtnStyle(couleurStatut(next), updating || bloque)}
            >
              {labelStatut(next)}
            </button>
          );
        })}
      </div>
      {itemsNonTraites && options.includes('en_transit') && (
        <p style={{ color: '#F59E0B', fontSize: 11, marginTop: 6 }}>
          Statuez chaque produit (Trouvé/Introuvable) avant de passer à l'expédition.
        </p>
      )}
      {erreur && <p style={{ color: '#FCA5A5', fontSize: 12, marginTop: 6 }}>{erreur}</p>}
    </div>
  );
}

function CommandeCard({ req, authUser }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)',
      borderRadius: 14, padding: 14, marginBottom: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <p style={{ color: '#fff', fontWeight: 700, fontSize: 14, margin: 0 }}>
          #{req.id.slice(0, 8)}
        </p>
        <span style={{
          fontSize: 11, fontWeight: 700, color: couleurStatut(req.statut),
          border: `1px solid ${couleurStatut(req.statut)}`, borderRadius: 8, padding: '3px 8px',
          whiteSpace: 'nowrap',
        }}>
          {labelStatut(req.statut)}
        </span>
      </div>

      <p style={{ color: '#ffffff70', fontSize: 12, margin: '6px 0' }}>
        {req.items?.length ?? 0} article{(req.items?.length ?? 0) > 1 ? 's' : ''} · Total{' '}
        {req.devis?.total?.toLocaleString('fr-FR')} {req.devis?.currency}
      </p>

      {req.items?.map((it, i) => (
        <ItemRow key={i} req={req} item={it} index={i} authUser={authUser}/>
      ))}

      <ActionButtons req={req} authUser={authUser}/>
    </div>
  );
}

export default function SourcingAgentDashboard({ authUser, isAgent }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!authUser?.uid || !isAgent) { setLoading(false); return; }
    const q = query(
      collection(db, 'sourcing_requests'),
      where('agentId', '==', authUser.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      // Une demande 'en_attente_paiement' n'est pas encore actionnable par
      // l'agent (le client n'a pas payé) — filtrée côté client pour éviter
      // un index composite Firestore supplémentaire (where + where + orderBy).
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(all.filter(r => r.statut !== 'en_attente_paiement'));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [authUser?.uid, isAgent]);

  // Vendeur non-agent → rien à afficher (voir note en haut du fichier).
  if (!isAgent) return null;
  if (loading) return <p style={{ color: '#ffffff70', padding: 16 }}>Chargement…</p>;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ color: '#fff', fontSize: 18, fontWeight: 800, margin: '0 0 14px' }}>Sourcing — commandes reçues</h2>
      {requests.length === 0 && (
        <p style={{ color: '#ffffff60', fontSize: 13 }}>Aucune commande sourcing pour le moment.</p>
      )}
      {requests.map(req => <CommandeCard key={req.id} req={req} authUser={authUser}/>)}
    </div>
  );
}