'use client';

// CommandeDetail.jsx
// Portage web (Next.js + Firebase) de CommandeDetailPage (Flutter).
// Design tokens — identiques à AjouterColisPage / AddVideoPage pour cohérence visuelle.
// npm install qrcode.react

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { QRCodeSVG } from 'qrcode.react';

// ⚠️ Adaptez ce chemin à votre projet
import { db } from '@/lib/firebaseClient';
import { labelStatut, couleurStatut, emojiStatut } from './statutUtils';

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

function shortCode(code, max = 10) {
  if (!code) return '';
  return code.length > max ? `${code.slice(0, max)}…` : code;
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

function Toast({ msg, isError, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, background: isError ? D.red : D.green,
      color: '#fff', borderRadius: 14, padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxWidth: 400, width: '92%',
      fontWeight: 600, fontSize: 14,
    }}>
      <span style={{ fontSize: 18 }}>{isError ? '⚠️' : '✅'}</span>
      <span>{msg}</span>
    </div>
  );
}

export default function CommandeDetailPage({ commandeId }) {
  const router = useRouter();
  const [commande, setCommande] = useState(null);
  // Données privées (adresse précise, téléphone, GPS) — sous-collection
  // /commandes/{commandeId}/private/contact, séparée du document public
  // depuis l'audit de sécurité (voir firestore.rules). Peut être null si
  // l'utilisateur n'a pas encore le droit d'y accéder (ex: livreur pas
  // encore assigné à la commande) — ce n'est PAS une erreur à afficher,
  // juste une absence légitime de données à ce stade.
  const [privateData, setPrivateData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!commandeId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'commandes', commandeId));
        if (snap.exists()) setCommande(snap.data());
      } catch (e) {
        console.error('❌ CommandeDetailPage:', e);
      } finally {
        setIsLoading(false);
      }

      // Lecture séparée du sous-document privé — dans son propre try/catch
      // pour ne jamais bloquer l'affichage du reste de la commande si
      // l'accès est refusé (règle Firestore : client, vendeur, ou livreur
      // assigné uniquement).
      try {
        const privSnap = await getDoc(doc(db, 'commandes', commandeId, 'private', 'contact'));
        if (privSnap.exists()) setPrivateData(privSnap.data());
      } catch (e) {
        // Accès refusé ou pas encore autorisé : comportement normal,
        // pas une erreur à remonter à l'utilisateur.
        console.warn('ℹ️ Détails privés non accessibles pour le moment:', e.message);
      }
    })();
  }, [commandeId]);

  const showToast = (msg, isError = false) => setToast({ msg, isError });

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${D.orange}`, borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
        <span style={{ color: D.text2, fontSize: 14 }}>Chargement...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!commande) {
    return (
      <div style={{ minHeight: '100vh', background: D.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: D.text2, fontSize: 14, fontWeight: 600 }}>Commande introuvable.</div>
      </div>
    );
  }

  const statut = commande.statut || 'en_attente';
  // Confirmé par netlify/functions/create-colis.js : le sous-document
  // /commandes/{id}/private/contact écrit adresseLivraison, telephoneClient,
  // clientLat, clientLng. Le document public ne contient plus ces champs.
  const adresse = privateData?.adresseLivraison ?? commande.adresseLivraison ?? '—';
  const villeDestination = commande.villeDestination || '';
  const adresseComplete = villeDestination && adresse !== '—'
    ? `${villeDestination} – ${adresse}`
    : (villeDestination || adresse);
  const telephoneClient = privateData?.telephoneClient ?? null;
  const gps =
    privateData?.clientLat != null && privateData?.clientLng != null
      ? { lat: privateData.clientLat, lng: privateData.clientLng }
      : null;

  const totalXof = commande.totalXof || 0;
  const devise = commande.devise || 'XOF';
  const totalDevise = commande.totalDevise ?? totalXof;
  const typeLiv = commande.typeLivraison || 'solo';
  const modePaie = commande.modePaiement || 'aLaLivraison';
  const batchId = commande.batchId || null;
  const livreurId = commande.livreurId || null;
  const qrCode = commande.qrCode || '';
  const articles = commande.articles || [];
  const createdAt = commande.createdAt?.toDate ? commande.createdAt.toDate() : null;

  const idCourt = `#${commandeId.slice(0, 8).toUpperCase()}`;
  const montantLabel =
    devise === 'XOF'
      ? fmtFcfa(totalXof)
      : `${totalDevise.toFixed(2)} ${symbolFor(devise)}`;

  const couleur = couleurStatut(statut, D);
  const emoji = emojiStatut(statut);

  const partagerQr = async () => {
    const texte = `Code de validation de ${idCourt} : ${qrCode}\nPrésentez ce code au livreur pour confirmer la livraison.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `Code QR — ${idCourt}`, text: texte });
      } catch {
        /* annulé par l'utilisateur */
      }
    } else {
      await navigator.clipboard.writeText(texte);
      showToast('Texte copié dans le presse-papiers');
    }
  };

  const copierCode = async () => {
    await navigator.clipboard.writeText(qrCode);
    showToast('Code copié !');
  };

  return (
    <div style={{ minHeight: '100vh', background: D.bg, position: 'relative', fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {toast && <Toast msg={toast.msg} isError={toast.isError} onClose={() => setToast(null)} />}

      {/* Header gradient */}
      <div style={{
        padding: '16px 22px 24px',
        background: `linear-gradient(135deg, ${D.orange} 0%, #FF9500 55%, ${D.zest} 100%)`,
        borderRadius: '0 0 32px 32px',
        boxShadow: `0 8px 20px ${D.orange}4D`,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <button
          onClick={() => router.back()}
          aria-label="Retour"
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 18, cursor: 'pointer',
          }}
        >←</button>
        <div>
          <div style={{ color: '#fff', fontSize: 19, fontWeight: 900, letterSpacing: -0.5 }}>
            Commande {idCourt}
          </div>
          {createdAt && (
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 }}>
              {formatDateLong(createdAt)}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 22px 100px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640, margin: '0 auto' }}>
        {/* Statut */}
        <div style={{
          padding: 16, borderRadius: 18,
          background: `${couleur}0F`, border: `1.5px solid ${couleur}4D`,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `${couleur}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>{emoji}</div>
          <div>
            <div style={{ color: D.text2, fontSize: 11, fontWeight: 600 }}>Statut de la commande</div>
            <div style={{ color: couleur, fontWeight: 800, fontSize: 16, marginTop: 2 }}>
              {labelStatut(statut)}
            </div>
          </div>
        </div>

        {/* Infos livraison */}
        <div style={{ background: D.card, borderRadius: 18, border: `1.5px solid ${D.border}`, padding: 18, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <InfoRow icon="📍" label="Adresse" value={adresseComplete} />
          <Divider />
          <InfoRow icon={typeLiv === 'groupee' ? '👥' : '👤'} label="Type" value={typeLiv === 'groupee' ? 'Livraison groupée' : 'Livraison solo'} />
          <Divider />
          <InfoRow icon={modePaie === 'immediat' ? '💳' : '🤝'} label="Paiement" value={modePaie === 'immediat' ? 'Payé en ligne' : 'À la livraison'} />
          <Divider />
          <InfoRow icon="🧾" label="Total" value={montantLabel} valueColor={D.orange} mono />
          {telephoneClient && (
            <>
              <Divider />
              <InfoRow icon="📞" label="Téléphone client" value={telephoneClient} mono />
            </>
          )}
          {gps && (
            <>
              <Divider />
              <InfoRow icon="🧭" label="GPS" value={`${Number(gps.lat).toFixed(5)}, ${Number(gps.lng).toFixed(5)}`} mono />
            </>
          )}
          {batchId && (
            <>
              <Divider />
              <InfoRow icon="🔀" label="Tournée" value={`#${batchId.slice(0, 8).toUpperCase()}`} mono />
            </>
          )}
          {livreurId && (
            <>
              <Divider />
              <InfoRow icon="🚴" label="Livreur" value="Assigné ✓" valueColor={D.green} />
            </>
          )}
        </div>

        {/* Aperçu QR */}
        {qrCode && (
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            style={{
              background: D.card, borderRadius: 18, border: `1.5px solid ${D.border}`,
              padding: 16, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              width: '100%', textAlign: 'left', font: 'inherit',
            }}
          >
            <div style={{ padding: 8, background: '#fff', borderRadius: 12, border: `1px solid ${D.border}`, flexShrink: 0 }}>
              <QRCodeSVG value={qrCode} size={64} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: D.text1, fontWeight: 700, fontSize: 14 }}>Code QR de validation</div>
              <div style={{ color: D.text2, fontSize: 11, marginTop: 3 }}>
                Touchez pour agrandir · Présentez au livreur
              </div>
              <div style={{
                color: D.orange, fontWeight: 800, fontSize: 16, marginTop: 8,
                fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {shortCode(qrCode)}
              </div>
            </div>
            <span style={{ color: D.text2, fontSize: 20, flexShrink: 0 }}>›</span>
          </button>
        )}

        {/* Articles */}
        <div style={{ background: D.card, borderRadius: 18, border: `1.5px solid ${D.border}`, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 17 }}>📦</span>
            <span style={{ color: D.text1, fontWeight: 700, fontSize: 14 }}>
              {articles.length} article{articles.length > 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {articles.map((a, i) => (
              <ArticleRow key={i} article={a} />
            ))}
          </div>
        </div>
      </div>

      {/* FAB QR */}
      {qrCode && (
        <button
          onClick={() => setQrOpen(true)}
          aria-label="Afficher le QR"
          style={{
            position: 'fixed', bottom: 24, right: 24,
            width: 56, height: 56, borderRadius: '50%',
            background: `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
            border: 'none', boxShadow: `0 8px 24px ${D.orange}58`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 22,
          }}
        >🔳</button>
      )}

      {/* Modal QR */}
      {qrOpen && (
        <QrModal
          qrCode={qrCode}
          onClose={() => setQrOpen(false)}
          onCopy={copierCode}
          onShare={partagerQr}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function InfoRow({ icon, label, value, valueColor, mono }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <span style={{ fontSize: 15, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ color: D.text2, fontSize: 11, fontWeight: 600 }}>{label}</div>
        <div style={{
          color: valueColor || D.text1, fontWeight: 700, fontSize: 14, marginTop: 2,
          fontFamily: mono ? 'monospace' : 'inherit',
        }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: D.orangeDim }} />;
}

function ArticleRow({ article }) {
  const nom = article.nom_frifri || article.name || article.nom || 'Article';
  const prix = article.prix_frifri ?? article.price ?? article.prix;
  const imageUrl = article.imageUrl || article.image || '';

  return (
    <div style={{
      background: D.bg, borderRadius: 14, border: `1px solid ${D.border}`,
      padding: 10, display: 'flex', gap: 12, alignItems: 'center',
    }}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          width={56}
          height={56}
          style={{ borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      ) : (
        <div style={{
          width: 56, height: 56, borderRadius: 10, background: D.orangeDim,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
        }}>🖼️</div>
      )}
      <div style={{ minWidth: 0 }}>
        <div style={{
          color: D.text1, fontWeight: 700, fontSize: 13,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {nom}
        </div>
        {prix != null && (
          <div style={{ color: D.orange, fontWeight: 700, fontSize: 13, marginTop: 3, fontFamily: 'monospace' }}>
            {fmtFcfa(prix)}
          </div>
        )}
      </div>
    </div>
  );
}

function QrModal({ qrCode, onClose, onCopy, onShare }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: D.card, borderRadius: 22, padding: 24, maxWidth: 360, width: '100%', position: 'relative' }}
      >
        <button
          onClick={onClose}
          aria-label="Fermer"
          style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: D.text2 }}
        >✕</button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ color: D.text1, fontWeight: 800, fontSize: 16 }}>Code QR de validation</div>
          <div style={{ color: D.text2, fontSize: 12, marginTop: 6, fontWeight: 600 }}>
            Présentez ce code au livreur
          </div>

          <div style={{
            marginTop: 20, padding: 12, background: '#fff', borderRadius: 18,
            border: `1.5px solid ${D.border}`, display: 'inline-block',
          }}>
            <QRCodeSVG value={qrCode} size={200} />
          </div>

          <button
            type="button"
            onClick={onCopy}
            style={{
              marginTop: 16, padding: '10px 14px', background: D.orangeDim,
              borderRadius: 12, border: `1px solid ${D.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: 'pointer', width: '100%', font: 'inherit',
            }}
          >
            <span style={{
              color: D.orange, fontWeight: 800, fontSize: 15, fontFamily: 'monospace',
              wordBreak: 'break-all', overflowWrap: 'anywhere', textAlign: 'center',
            }}>
              {qrCode}
            </span>
            <span style={{ fontSize: 14, flexShrink: 0 }}>📋</span>
          </button>

          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 14,
                border: `1.5px solid ${D.border}`, background: '#fff',
                color: D.text2, cursor: 'pointer', fontWeight: 700, fontSize: 14,
              }}
            >Fermer</button>
            <button
              onClick={onShare}
              style={{
                flex: 1, padding: '12px 0', borderRadius: 14, border: 'none',
                background: `linear-gradient(90deg, ${D.orange}, ${D.orangeHot})`,
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, cursor: 'pointer', fontWeight: 800, fontSize: 14,
                boxShadow: `0 6px 18px ${D.orange}45`,
              }}
            >📤 Partager</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDateLong(d) {
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).replace(' à ', ' · ');
}