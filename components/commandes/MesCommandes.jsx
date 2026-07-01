'use client';

// MesCommandes.jsx
// Portage web (Next.js + Firebase) de MesCommandesPage (Flutter).
// Design tokens — identiques à AjouterColisPage / AddVideoPage pour cohérence visuelle.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
} from 'firebase/firestore';

// ⚠️ Adaptez ce chemin à votre projet (voir memory: config Firebase client)
import { db, auth } from '@/lib/firebaseClient';
import { STATUTS, labelStatut, couleurStatut, emojiStatut } from './statutUtils';

const PAGE_SIZE = 10;

// ─── Design tokens — identiques à AddVideoPage / AjouterColisPage ───────────
const D = {
  orange:    "#FF6B00",
  orangeHot: "#FF8C00",
  zest:      "#FFB700",
  text1:     "#2D1500",
  text2:     "#8B5E3C",
  card:      "#FFFFFF",
  border:    "#FFDDB0",
  orangeDim: "#FFEDD5",
  bg:        "#FFF8EE",
  green:     "#1A9640",
  red:       "#E53E00",
};

const fmt = new Intl.NumberFormat('fr-FR');
const SYMBOLS = { NGN: '₦', GHS: 'GH₵', USD: '$' };
const symbolFor = (devise) => SYMBOLS[devise] || 'FCFA';

export default function MesCommandesPage() {
  const router = useRouter();

  const [docs, setDocs] = useState([]); // [{ id, data }]
  const [lastDoc, setLastDoc] = useState(null); // curseur Firestore
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState(null);

  const sentinelRef = useRef(null);
  const uid = auth.currentUser?.uid;

  // ── Chargement (initial + pagination) ────────────────────
  const charger = useCallback(
    async ({ reset = false } = {}) => {
      if (!uid) {
        setIsLoading(false);
        return;
      }

      if (reset) {
        setDocs([]);
        setLastDoc(null);
        setHasMore(true);
        setIsLoading(true);
      } else {
        if (!hasMore) return;
        setIsLoadingMore(true);
      }

      try {
        const clauses = [
          where('clientId', '==', uid),
          orderBy('createdAt', 'desc'),
        ];
        if (filtreStatut) clauses.push(where('statut', '==', filtreStatut));

        const cursor = reset ? null : lastDoc;
        const q = cursor
          ? query(
              collection(db, 'commandes'),
              ...clauses,
              startAfter(cursor),
              limit(PAGE_SIZE)
            )
          : query(collection(db, 'commandes'), ...clauses, limit(PAGE_SIZE));

        const snap = await getDocs(q);
        const newDocs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

        setDocs((prev) => (reset ? newDocs : [...prev, ...newDocs]));
        setLastDoc(snap.docs[snap.docs.length - 1] || null);
        setHasMore(snap.docs.length === PAGE_SIZE);
      } catch (e) {
        console.error('❌ MesCommandesPage:', e);
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid, filtreStatut, lastDoc, hasMore]
  );

  useEffect(() => {
    charger({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, filtreStatut]);

  // ── Scroll infini via IntersectionObserver ────────────────
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading) {
          charger();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, isLoadingMore, isLoading, charger]);

  return (
    <div style={{
      minHeight: '100vh', background: D.bg,
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
    }}>
      <Header count={docs.length} onBack={() => router.back()} />
      <Filtres filtreStatut={filtreStatut} onChange={setFiltreStatut} />
      <div style={{ flex: 1 }}>
        <Body
          uid={uid}
          isLoading={isLoading}
          docs={docs}
          filtreStatut={filtreStatut}
          hasMore={hasMore}
          sentinelRef={sentinelRef}
          onOpen={(id) => router.push(`/commandes/${id}`)}
        />
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Bandeau gradient ──────────────────────────────────────
function Header({ count, onBack }) {
  return (
    <div style={{
      padding: '16px 22px 24px',
      background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
      borderRadius: '0 0 32px 32px',
      boxShadow: `0 8px 20px ${D.orange}4D`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}>
      <button
        onClick={onBack}
        aria-label="Retour"
        style={{
          width: 38, height: 38, borderRadius: 12,
          background: 'rgba(255,255,255,0.25)',
          border: '1px solid rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 18, cursor: 'pointer',
        }}
      >←</button>
      <div>
        <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
          Mes commandes
        </div>
        {count > 0 && (
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
            {count} commande{count > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filtres horizontaux ───────────────────────────────────
function Filtres({ filtreStatut, onChange }) {
  return (
    <div style={{ background: D.card, padding: '14px 0', borderBottom: `1px solid ${D.orangeDim}` }}>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', padding: '0 16px',
      }}>
        {STATUTS.map((f) => {
          const selected = filtreStatut === f.value;
          const color = f.value === null ? D.orange : couleurStatut(f.value, D);
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => onChange(f.value)}
              style={{
                flexShrink: 0, padding: '9px 16px', borderRadius: 20,
                border: `1.5px solid ${selected ? color : D.border}`,
                background: selected ? color : D.orangeDim,
                color: selected ? '#fff' : D.text2,
                fontSize: 12.5, fontWeight: selected ? 700 : 600,
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Corps ─────────────────────────────────────────────────
function Body({ uid, isLoading, docs, filtreStatut, hasMore, sentinelRef, onOpen }) {
  if (!uid) {
    return <EmptyState icon="🔒" message="Vous devez être connecté." />;
  }
  if (isLoading) {
    return <Spinner />;
  }
  if (docs.length === 0) {
    return (
      <EmptyState
        icon="📦"
        message={
          filtreStatut === null
            ? "Aucune commande pour l'instant."
            : 'Aucune commande dans cette catégorie.'
        }
      />
    );
  }

  return (
    <div style={{ padding: '18px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {docs.map(({ id, data }) => (
        <CommandeCard key={id} docId={id} data={data} onClick={() => onOpen(id)} />
      ))}
      {hasMore && (
        <div ref={sentinelRef} style={{ padding: '20px 0', display: 'flex', justifyContent: 'center' }}>
          <Spinner inline />
        </div>
      )}
    </div>
  );
}

function Spinner({ inline = false }) {
  const style = inline
    ? {}
    : { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 };
  return (
    <div style={style}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        border: `3px solid ${D.orange}`, borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 300, gap: 14, textAlign: 'center', padding: '0 24px',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: D.orangeDim, border: `1.5px solid ${D.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
      }}>{icon}</div>
      <div style={{ color: D.text2, fontSize: 14, fontWeight: 600 }}>{message}</div>
    </div>
  );
}

// ── Carte d'une commande ──────────────────────────────────
function CommandeCard({ docId, data, onClick }) {
  const statut = data.statut || 'en_attente';
  const articles = data.articles || [];
  const totalXof = data.totalXof || 0;
  const devise = data.devise || 'XOF';
  const totalDevise = data.totalDevise ?? totalXof;
  const adresse = data.adresseLivraison || '—';
  const batchId = data.batchId || null;
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : null;

  const idCourt = `#${docId.slice(0, 8).toUpperCase()}`;
  const firstArticle = articles[0];
  const firstImg = firstArticle?.imageUrl || firstArticle?.image || null;

  const montantLabel =
    devise === 'XOF'
      ? fmtFcfa(totalXof)
      : `${totalDevise.toFixed(2)} ${symbolFor(devise)}`;

  const couleur = couleurStatut(statut, D);
  const label = labelStatut(statut);
  const emoji = emojiStatut(statut);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      style={{
        background: D.card, borderRadius: 18,
        border: `1.5px solid ${D.border}`, boxShadow: `0 4px 12px ${D.orange}0D`,
        padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer',
      }}
    >
      {/* Vignette */}
      {firstImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstImg}
          alt=""
          width={60}
          height={60}
          style={{ borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div style={{
          width: 60, height: 60, borderRadius: 12,
          background: D.orangeDim, border: `1px solid ${D.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, flexShrink: 0,
        }}>📦</div>
      )}

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ color: D.orange, fontWeight: 800, fontSize: 13, fontFamily: 'monospace' }}>
            {idCourt}
          </span>
          <div style={{ flex: 1 }} />
          {createdAt && (
            <span style={{ color: D.text2, fontSize: 11 }}>{formatDate(createdAt)}</span>
          )}
        </div>

        <div style={{
          marginTop: 5, color: D.text1, fontSize: 13, fontWeight: 700,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {adresse}
        </div>

        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: D.text2, fontSize: 12, fontWeight: 600 }}>
            {articles.length} article{articles.length > 1 ? 's' : ''}
          </span>
          {batchId && (
            <span style={{ color: D.text2, fontSize: 11, fontWeight: 600 }}>🔀 Groupée</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 9px', borderRadius: 20, background: `${couleur}1A`,
          }}>
            <span style={{ fontSize: 11 }}>{emoji}</span>
            <span style={{ color: couleur, fontSize: 11, fontWeight: 700 }}>{label}</span>
          </span>
        </div>

        <div style={{ marginTop: 8, color: D.orange, fontWeight: 900, fontSize: 15, fontFamily: 'monospace' }}>
          {montantLabel}
        </div>
      </div>

      <span style={{ color: D.text2, fontSize: 18, marginTop: 2, flexShrink: 0 }}>›</span>
    </div>
  );
}

function fmtFcfa(v) {
  const s = Math.round(v).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const fromEnd = s.length - i;
    if (i > 0 && fromEnd % 3 === 0) out += '\u202F';
    out += s[i];
  }
  return `${out} FCFA`;
}

function formatDate(d) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  if (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  ) {
    return `Aujourd'hui ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}