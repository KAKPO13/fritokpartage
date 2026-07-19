'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebaseClient';
import { useAdmin } from '@/lib/adminContext';

const PAYMENT_TERM_OPTIONS = ['comptant', 'net30', 'net60'];

export default function B2BVerificationAdminPage() {
  const { authUser } = useAdmin();
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'Vendeur'),
        where('b2bSupplier.status', '==', 'pending')
      );
      const snap = await getDocs(q);
      setPending(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui', color: '#fff' }}>
      <h1 style={{ fontWeight: 800, marginBottom: 4 }}>Demandes fournisseur B2B en attente</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
        Valider ici écrit directement pricingTiers/paymentTerms et publie la fiche
        publique — plus besoin (et surtout plus le droit) d'éditer <code>b2bSupplier.status</code> à
        la main dans la console.
      </p>

      {loading ? <p>Chargement…</p> : pending.length === 0 ? (
        <p>Aucune demande en attente.</p>
      ) : (
        pending.map(u => (
          <SupplierRequestCard key={u.id} user={u} authUser={authUser}
            onDone={() => setPending(prev => prev.filter(p => p.id !== u.id))} />
        ))
      )}
    </div>
  );
}

function SupplierRequestCard({ user, authUser, onDone }) {
  const supplier = user.b2bSupplier;
  const [tiers, setTiers] = useState([{ minQty: supplier.moq || 1, maxQty: '', unitPriceFCFA: '' }]);
  const [terms, setTerms] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const addTier = () => setTiers(prev => [...prev, { minQty: '', maxQty: '', unitPriceFCFA: '' }]);
  const updateTier = (i, field, value) => setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  const toggleTerm = (t) => setTerms(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const call = async (decision) => {
    setError(null);
    setSubmitting(true);
    try {
      const idToken = await authUser.getIdToken();
      const payload = { uid: user.id, decision };
      if (decision === 'verified') {
        payload.pricingTiers = tiers.map(t => ({
          minQty: Number(t.minQty),
          maxQty: t.maxQty === '' ? null : Number(t.maxQty),
          unitPriceFCFA: Number(t.unitPriceFCFA),
        }));
        payload.moq = supplier.moq;
        payload.paymentTerms = terms;
      }
      const res = await fetch('/.netlify/functions/verify-b2b-supplier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Échec');
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ border: '1px solid #333', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <div style={{ fontWeight: 700 }}>{user.nomBoutique || user.username} — {user.id}</div>
      <div style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>
        {supplier.accountType} · {supplier.filiere} · MOQ déclaré {supplier.moq}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, fontSize: 13 }}>
        <a href={supplier.documents?.registreCommerce} target="_blank" rel="noreferrer" style={{ color: '#ff4d00' }}>Registre de commerce</a>
        <a href={supplier.documents?.nif} target="_blank" rel="noreferrer" style={{ color: '#ff4d00' }}>NIF</a>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Grille tarifaire</div>
      {tiers.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
          <input placeholder="min qty" value={t.minQty} onChange={e => updateTier(i, 'minQty', e.target.value)} style={{ width: 70 }} />
          <input placeholder="max qty (vide=∞)" value={t.maxQty} onChange={e => updateTier(i, 'maxQty', e.target.value)} style={{ width: 100 }} />
          <input placeholder="prix unitaire FCFA" value={t.unitPriceFCFA} onChange={e => updateTier(i, 'unitPriceFCFA', e.target.value)} style={{ width: 130 }} />
        </div>
      ))}
      <button onClick={addTier} style={{ fontSize: 12, marginBottom: 10 }}>+ palier</button>

      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Conditions de paiement</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {PAYMENT_TERM_OPTIONS.map(t => (
          <label key={t} style={{ fontSize: 13 }}>
            <input type="checkbox" checked={terms.includes(t)} onChange={() => toggleTerm(t)} /> {t}
          </label>
        ))}
      </div>

      {error && <p style={{ color: '#ff4520', fontSize: 12 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8 }}>
        <button disabled={submitting} onClick={() => call('verified')} style={{ background: '#1a9640', color: '#fff', padding: '8px 14px', border: 'none', borderRadius: 6 }}>
          Valider
        </button>
        <button disabled={submitting} onClick={() => call('rejected')} style={{ background: '#e53e00', color: '#fff', padding: '8px 14px', border: 'none', borderRadius: 6 }}>
          Rejeter
        </button>
      </div>
    </div>
  );
}