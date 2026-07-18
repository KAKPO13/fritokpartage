//app/agent/sourcing/[requestId].js

import { useState } from 'react';
import Head from 'next/head';
import { verifierTokenAgent } from '../../../netlify/functions/_sourcingShared';

const C = {
  orange: '#ff4d00', orangeSoft: 'rgba(255,77,0,0.08)',
  bg: '#0d0d0d', card: '#161616', border: 'rgba(255,255,255,0.1)',
  text: '#fff', muted: 'rgba(255,255,255,0.55)',
  green: '#34C759', red: '#ff4520',
};

const STATUT_LABELS = {
  en_attente_paiement: 'En attente de paiement',
  sourcing_en_cours: 'Sourcing en cours',
  partiellement_introuvable: 'Certains produits introuvables',
  en_transit: 'En transit',
  livree: 'Livrée',
  annulee: 'Annulée',
};


export async function getServerSideProps({ params, query }) {
  const { requestId } = params;
  const { token } = query;
  if (!token) return { notFound: true };

  const auth = verifierTokenAgent(token);
  if (!auth || auth.requestId !== requestId) return { notFound: true };

  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.applicationDefault() });
  }

  const doc = await admin.firestore().collection('sourcing_requests').doc(requestId).get();
  if (!doc.exists) return { notFound: true };

  // Sécurité supplémentaire : le token doit correspondre à l'agent réellement
  // assigné dans le document, pas seulement être signé correctement (protège
  // contre un vieux token valide dont l'assignation aurait changé depuis)
  const data = doc.data();
  if (data.agentId !== auth.agentId) return { notFound: true };

  const agentDoc = await admin.firestore().collection('agent_local_fritok').doc(auth.agentId).get();

  return {
    props: {
      requestId,
      token,
      data: JSON.parse(JSON.stringify(data)),
      agent: agentDoc.exists ? JSON.parse(JSON.stringify(agentDoc.data())) : null,
    },
  };
}

export default function AgentSourcingPage({ requestId, token, data: initialData, agent }) {
  const [data, setData] = useState(initialData);
  const [busyIndex, setBusyIndex] = useState(null);
  const [busyStatut, setBusyStatut] = useState(false);
  const [erreur, setErreur] = useState(null);

  const appelerAPI = async (body) => {
    const res = await fetch('/.netlify/functions/agent-update-sourcing-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...body }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Erreur');
    return json;
  };

  const marquerItem = async (index, statutItem) => {
    setErreur(null);
    setBusyIndex(index);
    try {
      const result = await appelerAPI({ action: 'update_item', itemIndex: index, statutItem });
      setData(d => ({ ...d, items: result.items }));
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusyIndex(null);
    }
  };

  const changerStatut = async (nouveauStatut) => {
    setErreur(null);
    setBusyStatut(true);
    try {
      const result = await appelerAPI({ action: 'update_statut', nouveauStatut });
      setData(d => ({ ...d, statut: result.statut }));
    } catch (e) {
      setErreur(e.message);
    } finally {
      setBusyStatut(false);
    }
  };

  const tousStatues = data.items.every(i => i.statutItem !== 'a_verifier');
  const unIntrouvable = data.items.some(i => i.statutItem === 'introuvable');

  return (
    <>
      <Head><title>Demande de sourcing #{requestId.slice(0, 8)} — FriTok</title></Head>
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'system-ui, sans-serif', padding: '20px 16px 60px' }}>
        <div style={{ maxWidth: 480, margin: '0 auto' }}>

          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>Demande</p>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: '2px 0 8px' }}>#{requestId.slice(0, 8)}</h1>
            <div style={{
              display: 'inline-flex', padding: '5px 12px', borderRadius: 20,
              background: C.orangeSoft, color: C.orange, fontSize: 13, fontWeight: 600,
            }}>
              {STATUT_LABELS[data.statut] || data.statut}
            </div>
          </div>

          {agent && (
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>
              Assignée à {agent.prenom} {agent.nom} — {agent.ville}, {agent.pays}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {data.items.map((item, i) => (
              <div key={item.videoId} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <img src={item.image} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>{item.titre}</p>
                    <p style={{ margin: '3px 0', fontSize: 13, color: C.muted }}>
                      Quantité : {item.quantite} · {item.prixUnitaire.toLocaleString('fr-FR')} {data.devis.currency}/unité
                    </p>
                    <a href={item.lienProduit} target="_blank" rel="noopener noreferrer" style={{ color: C.orange, fontSize: 13, textDecoration: 'underline' }}>
                      Voir le produit sur FriTok →
                    </a>
                  </div>
                </div>

                {item.statutItem === 'a_verifier' && ['sourcing_en_cours', 'partiellement_introuvable'].includes(data.statut) && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => marquerItem(i, 'trouve')} disabled={busyIndex === i}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: 'none', background: C.green, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      ✓ Trouvé
                    </button>
                    <button onClick={() => marquerItem(i, 'introuvable')} disabled={busyIndex === i}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1px solid ${C.red}`, background: 'transparent', color: C.red, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                      Introuvable
                    </button>
                  </div>
                )}

                {item.statutItem === 'trouve' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Marqué comme trouvé</div>
                )}
                {item.statutItem === 'introuvable' && (
                  <div style={{ marginTop: 10, fontSize: 12, color: C.red, fontWeight: 600 }}>✕ Marqué comme introuvable</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ background: C.orangeSoft, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <Row label="Sous-total articles" value={`${data.devis.sousTotal.toLocaleString('fr-FR')} ${data.devis.currency}`} />
            <Row label="Frais sourcing" value={`${(data.devis.feeItems + data.devis.feePerOrder).toLocaleString('fr-FR')} ${data.devis.currency}`} />
            <Row label="Livraison" value={`${data.devis.shippingToClient.toLocaleString('fr-FR')} ${data.devis.currency}`} />
            {data.devis.montantRembourse > 0 && (
              <Row label="Remboursé" value={`- ${data.devis.montantRembourse.toLocaleString('fr-FR')} ${data.devis.currency}`} />
            )}
            <div style={{ height: 1, background: C.border, margin: '8px 0' }} />
            <Row label="Total" value={`${data.devis.total.toLocaleString('fr-FR')} ${data.devis.currency}`} bold />
          </div>

          {erreur && (
            <div style={{ background: 'rgba(255,69,32,0.1)', color: C.red, padding: 12, borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
              {erreur}
            </div>
          )}

          {data.statut === 'sourcing_en_cours' && (
            <button onClick={() => changerStatut(unIntrouvable ? 'partiellement_introuvable' : 'en_transit')} disabled={!tousStatues || busyStatut}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: tousStatues ? C.orange : C.border, color: '#fff', fontWeight: 700, fontSize: 15, cursor: tousStatues ? 'pointer' : 'not-allowed' }}>
              {!tousStatues ? 'Statuez chaque produit avant de continuer' : busyStatut ? 'Envoi...' : 'Confirmer et passer à l\'expédition'}
            </button>
          )}

          {data.statut === 'partiellement_introuvable' && (
            <button onClick={() => changerStatut('en_transit')} disabled={busyStatut}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.orange, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Confirmer l'expédition des produits trouvés
            </button>
          )}

          {data.statut === 'en_transit' && (
            <button onClick={() => changerStatut('livree')} disabled={busyStatut}
              style={{ width: '100%', padding: 14, borderRadius: 12, border: 'none', background: C.green, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
              Marquer comme livrée
            </button>
          )}

          {data.statut === 'en_attente_paiement' && (
            <p style={{ textAlign: 'center', color: C.muted, fontSize: 13 }}>
              En attente du paiement du client avant de démarrer le sourcing.
            </p>
          )}

          {data.statut === 'livree' && (
            <p style={{ textAlign: 'center', color: C.green, fontSize: 14, fontWeight: 600 }}>✓ Commande livrée</p>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: bold ? 15 : 13, color: bold ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: bold ? 700 : 400, marginBottom: 6 }}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}