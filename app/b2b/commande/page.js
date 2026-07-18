'use client';

// app/b2b/commande/page.js
//
// Reprend la structure de B2BSourcingFlow (OrderView) livrée précédemment,
// mais remplace intégralement MOCK_SUPPLIERS par une lecture réelle de
// /b2b_suppliers_public/{sellerId} pour chaque fournisseur présent dans le
// panier — voir firestore-rules-b2b-loop-closure.js pour la lecture
// autorisée, et verify-b2b-supplier.js pour ce qui alimente cette collection.

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../../lib/firebaseClient';

function fcfa(n) {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/,/g, ' ')} FCFA`;
}

function tierForQty(tiers, qty) {
  return tiers.find(t => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty)) ?? tiers[tiers.length - 1];
}
function nextTier(tiers, qty) {
  const idx = tiers.findIndex(t => qty >= t.minQty && (t.maxQty === null || qty <= t.maxQty));
  return idx >= 0 && idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

export default function B2BCommandePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  const [lines, setLines] = useState([]);          // lignes issues du panier (sessionStorage)
  const [suppliers, setSuppliers] = useState({});   // sellerId -> fiche b2b_suppliers_public
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [activeSellerId, setActiveSellerId] = useState(null);

  const [entreprise, setEntreprise] = useState({ nom: '', telephone: '', adresseFacturation: '', registreCommerce: '' });
  const [paymentTerm, setPaymentTerm] = useState(null);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmedOrders, setConfirmedOrders] = useState([]); // commandes déjà créées dans cette session

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthUser(user?.emailVerified ? user : null);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Relit les lignes sélectionnées dans le panier (voir B2BCartSheet.onConfirm
  // dans b2b-mode-patch.js, qui écrit cette clé avant de naviguer ici).
  useEffect(() => {
    try {
      const raw = JSON.parse(sessionStorage.getItem('fritok_b2b_order_lines') || '[]');
      setLines(raw);
    } catch {
      setLines([]);
    }
  }, []);

  // Résout la vraie fiche fournisseur pour chaque sellerId distinct du panier.
  useEffect(() => {
    if (lines.length === 0) { setLoadingSuppliers(false); return; }
    let cancelled = false;

    (async () => {
      setLoadingSuppliers(true);
      const uniqueSellerIds = [...new Set(lines.map(l => l.sellerId))];
      const entries = await Promise.all(uniqueSellerIds.map(async id => {
        try {
          const snap = await getDoc(doc(db, 'b2b_suppliers_public', id));
          return [id, snap.exists() ? { id, ...snap.data() } : null];
        } catch {
          return [id, null];
        }
      }));
      if (cancelled) return;
      const map = Object.fromEntries(entries);
      setSuppliers(map);
      const firstValid = uniqueSellerIds.find(id => map[id]);
      setActiveSellerId(firstValid ?? uniqueSellerIds[0]);
      setLoadingSuppliers(false);
    })();

    return () => { cancelled = true; };
  }, [lines]);

  const supplierIds = useMemo(() => [...new Set(lines.map(l => l.sellerId))], [lines]);
  const activeSupplier = suppliers[activeSellerId] || null;
  const activeLines = lines.filter(l => l.sellerId === activeSellerId);
  const totalQty = activeLines.reduce((s, l) => s + l.quantite, 0);
  const activeTier = activeSupplier ? tierForQty(activeSupplier.pricingTiers, totalQty) : null;
  const upcoming = activeSupplier ? nextTier(activeSupplier.pricingTiers, totalQty) : null;
  const grandTotal = activeSupplier && activeTier ? activeTier.unitPriceFCFA * totalQty : 0;
  const moqOk = activeSupplier ? totalQty >= activeSupplier.moq : true;

  useEffect(() => {
    if (activeSupplier && !paymentTerm) setPaymentTerm(activeSupplier.paymentTerms?.[0] ?? null);
  }, [activeSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = () => {
    const e = {};
    if (!entreprise.nom.trim())               e.nom = 'Nom de l\'entreprise requis';
    if (entreprise.telephone.replace(/\D/g, '').length < 8) e.telephone = 'Téléphone invalide';
    if (!entreprise.adresseFacturation.trim()) e.adresse = 'Adresse de facturation requise';
    if (!moqOk)                                e.moq = `Quantité totale sous le MOQ (${activeSupplier?.moq})`;
    if (!paymentTerm)                          e.paymentTerm = 'Choisissez une condition de paiement';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!authUser) return;
    if (!validate()) return;
    setSubmitting(true);
    try {
      const idToken = await authUser.getIdToken();
      const res = await fetch('/.netlify/functions/create-b2b-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          sellerId: activeSellerId,
          lignes: activeLines.map(l => ({ videoId: l.videoId, nom: l.nom, quantite: l.quantite })),
          paymentTerm,
          entreprise,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec de la commande');

      setConfirmedOrders(prev => [...prev, { sellerId: activeSellerId, sellerName: activeSupplier?.nomBoutique, ...data }]);

      // Retire ce fournisseur du panier restant et passe au suivant.
      const remaining = supplierIds.filter(id => id !== activeSellerId);
      setLines(prev => prev.filter(l => l.sellerId !== activeSellerId));
      setActiveSellerId(remaining[0] ?? null);
      setPaymentTerm(null);

      if (remaining.length === 0) {
        try { sessionStorage.removeItem('fritok_b2b_order_lines'); } catch {}
      }
    } catch (e) {
      setErrors({ submit: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (!authReady || loadingSuppliers) {
    return <div style={{ padding: 24, color: '#fff' }}>Chargement…</div>;
  }

  if (!authUser) {
    return (
      <div style={{ padding: 24, color: '#fff' }}>
        <p>Connectez-vous pour créer un bon de commande.</p>
        <a href="/login" style={{ color: '#ff4d00' }}>Se connecter</a>
      </div>
    );
  }

  if (lines.length === 0 && confirmedOrders.length === 0) {
    return (
      <div style={{ padding: 24, color: '#fff' }}>
        <p>Aucune ligne à traiter — retournez au panier depuis le feed.</p>
        <a href="/demo" style={{ color: '#ff4d00' }}>← Retour au feed</a>
      </div>
    );
  }

  if (lines.length === 0 && confirmedOrders.length > 0) {
    return (
      <div style={{ padding: 24, color: '#fff', maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontWeight: 800, marginBottom: 16 }}>Bons de commande envoyés ✅</h1>
        {confirmedOrders.map(o => (
          <div key={o.commandeId} style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12, padding: 14, marginBottom: 10,
          }}>
            <div style={{ fontWeight: 700 }}>{o.sellerName}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>Commande #{o.commandeId}</div>
            <div style={{ fontSize: 14, marginTop: 4, color: '#ff4d00', fontWeight: 700 }}>
              {fcfa(o.totalFCFA)} — {fcfa(o.unitPriceAppliqueFCFA)}/unité
            </div>
          </div>
        ))}
        <a href="/demo" style={{ color: '#ff4d00' }}>← Retour au feed</a>
      </div>
    );
  }

  if (!activeSupplier) {
    return (
      <div style={{ padding: 24, color: '#fff' }}>
        <p>Le fournisseur de cette ligne n'est plus vérifié B2B — retirez-la du panier.</p>
        <button onClick={() => setLines(prev => prev.filter(l => l.sellerId !== activeSellerId))}>
          Retirer ces produits
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: '#0a0a0a', color: '#fff', minHeight: '100dvh', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Bon de commande</h1>
        <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>
          Fournisseur {supplierIds.indexOf(activeSellerId) + 1}/{supplierIds.length} — un bon distinct par fournisseur.
        </p>

        {/* Récap fournisseur */}
        <div style={{ background: '#533AB7', borderRadius: 16, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>{activeSupplier.nomBoutique}</div>
          <div style={{ fontSize: 26, fontWeight: 800 }}>{fcfa(grandTotal)}</div>
          <div style={{ fontSize: 13, marginTop: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span>Prix unitaire palier atteint</span>
            <span style={{ fontWeight: 700, color: '#FFD580' }}>{fcfa(activeTier.unitPriceFCFA)}/unité</span>
          </div>
          {upcoming && (
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>
              +{upcoming.minQty - totalQty} article(s) pour passer à {fcfa(upcoming.unitPriceFCFA)}/unité
            </div>
          )}
          {!moqOk && (
            <div style={{ fontSize: 11, color: '#FFB4A8', marginTop: 6 }}>
              ⚠️ MOQ de {activeSupplier.moq} non atteint (actuellement {totalQty})
            </div>
          )}
        </div>

        {/* Grille tarifaire */}
        <div style={{ background: '#141414', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          {activeSupplier.pricingTiers.map((t, i) => {
            const on = t === activeTier;
            const range = t.maxQty ? `${t.minQty}–${t.maxQty}` : `${t.minQty}+`;
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 14px',
                background: on ? 'rgba(14,107,92,0.25)' : 'transparent',
                borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                fontSize: 13,
              }}>
                <span style={{ opacity: on ? 1 : 0.6 }}>{range} unités</span>
                <span style={{ fontWeight: 700, color: on ? '#34C759' : '#fff' }}>
                  {fcfa(t.unitPriceFCFA)} {on && '· actuel'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Conditions de paiement */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Paiement</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {activeSupplier.paymentTerms.map(term => (
              <button key={term} onClick={() => setPaymentTerm(term)}
                style={{
                  padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: paymentTerm === term ? '#533AB7' : 'rgba(255,255,255,0.06)',
                  color: '#fff', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                }}>
                {{ comptant: 'Comptant', net30: 'Net 30j', net60: 'Net 60j' }[term] ?? term}
              </button>
            ))}
          </div>
          {errors.paymentTerm && <p style={{ color: '#ff4d00', fontSize: 12 }}>{errors.paymentTerm}</p>}
        </div>

        {/* Lignes */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>
            Produits ({activeLines.length})
          </div>
          {activeLines.map(l => (
            <div key={l.videoId} style={{
              display: 'flex', justifyContent: 'space-between', padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13,
            }}>
              <span>{l.nom} × {l.quantite}</span>
              <span style={{ fontWeight: 700 }}>{fcfa(activeTier.unitPriceFCFA * l.quantite)}</span>
            </div>
          ))}
        </div>

        {/* Coordonnées entreprise */}
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 6, textTransform: 'uppercase' }}>Entreprise</div>
        {[
          ['nom', 'Nom de l\'entreprise'],
          ['telephone', 'Téléphone de contact'],
          ['adresseFacturation', 'Adresse de facturation'],
          ['registreCommerce', 'N° registre de commerce (optionnel)'],
        ].map(([key, label]) => (
          <div key={key} style={{ marginBottom: 10 }}>
            <input
              placeholder={label}
              value={entreprise[key]}
              onChange={e => setEntreprise(prev => ({ ...prev, [key]: e.target.value }))}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 10, fontSize: 13,
                background: 'rgba(255,255,255,0.05)', border: `1.5px solid ${errors[key] ? '#ff4520' : 'rgba(255,255,255,0.1)'}`,
                color: '#fff',
              }}
            />
            {errors[key] && <p style={{ color: '#ff4520', fontSize: 11, marginTop: 2 }}>{errors[key]}</p>}
          </div>
        ))}

        {errors.submit && <p style={{ color: '#ff4520', fontSize: 12, marginBottom: 8 }}>{errors.submit}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: 15, borderRadius: 14, border: 'none',
            background: '#533AB7', color: '#fff', fontWeight: 700, fontSize: 15,
            cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Envoi…' : `Envoyer à ${activeSupplier.nomBoutique}`}
        </button>
      </div>
    </div>
  );
}