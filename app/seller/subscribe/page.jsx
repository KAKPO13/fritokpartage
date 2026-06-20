// pages/seller/subscribe.jsx  (ou app/seller/subscribe/page.jsx)
// Portail d'abonnement vendeur : choix du plan + paiement Flutterwave
// Route : /seller/subscribe

'use client';

import { useState }              from 'react';
import useSellerSubscription from '../../hooks/useSellerSubscription';


// ── Palette Fritok ─────────────────────────────────────────
const D = {
  bg: '#FFF8EE', surface: '#FFFFFF', border: '#FFDDB0',
  orange: '#FF6B00', orangeDim: '#FFEDD5',
  text1: '#2D1500', text2: '#8B5E3C', text3: '#BF9060',
  green: '#1A9640', greenLight: '#E6F7EC',
  amber: '#B45309', amberLight: '#FEF3C7',
  red: '#E53E00',
};

// ── Définitions des plans ──────────────────────────────────
const PLANS = [
  {
    id: 'essentiel',
    label: 'Essentiel',
    priceXof: 2500,
    icon: '🏪',
    popular: false,
    features: [
      'Jusqu\'à 10 articles publiés',
      'Chat client inclus',
      'Statistiques de base',
      'Support standard',
    ],
  },
  {
    id: 'pro',
    label: 'Pro',
    priceXof: 5000,
    icon: '🚀',
    popular: true,
    features: [
      'Jusqu\'à 50 articles publiés',
      'Vitrine personnalisée',
      'Live Shopping inclus',
      'Statistiques avancées',
      'Support prioritaire',
    ],
  },
  {
    id: 'elite',
    label: 'Elite',
    priceXof: 10000,
    icon: '💎',
    popular: false,
    features: [
      'Articles illimités',
      'Vitrine premium',
      'Live + co-hosts illimités',
      'Tableau de bord analytics',
      'Support VIP dédié',
      'Badge vendeur vérifié',
    ],
  },
];

// Taux de conversion pour l'affichage (fallback statique)
const DISPLAY_RATES = { XOF: 1, GHS: 0.013, NGN: 4.75 };
const CUR_META = {
  XOF: { symbol: 'FCFA', decimals: 0 },
  GHS: { symbol: 'GH₵',  decimals: 2 },
  NGN: { symbol: '₦',    decimals: 2 },
};

function fmtPrice(amountXof, currency) {
  const rate = DISPLAY_RATES[currency] ?? 1;
  const m    = CUR_META[currency] ?? CUR_META.XOF;
  const n    = m.decimals === 0
    ? Math.round(amountXof * rate)
    : (amountXof * rate).toFixed(m.decimals);
  return `${new Intl.NumberFormat('fr-FR').format(n)} ${m.symbol}`;
}

export default function SubscribePage() {
  const { subscription, status, daysLeft, startPayment, loading } = useSellerSubscription();
  const [selectedPlan,     setSelectedPlan]     = useState('pro');
  const [selectedCurrency, setSelectedCurrency] = useState('XOF');
  const [paying,           setPaying]           = useState(false);
  const [payError,         setPayError]         = useState('');

  const handlePay = async () => {
    setPaying(true); setPayError('');
    try {
      await startPayment({ plan: selectedPlan, currency: selectedCurrency });
    } catch (e) {
      setPayError(e.message ?? 'Erreur lors du paiement');
    }
    setPaying(false);
  };

  // Déjà abonné actif
  const isActive = status === 'active';
  const isTrial  = status === 'trial';

  return (
    <div style={{ background: D.bg, minHeight: '100vh', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ background: D.orange, padding: '48px 24px 36px', textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🛍️</div>
        <h1 style={{ color: '#fff', fontSize: 30, fontWeight: 900, margin: '0 0 8px', letterSpacing: -0.5 }}>
          Abonnement Vendeur FriTok
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.78)', fontSize: 15, margin: 0 }}>
          Vendez, livrez et prospérez — commencez avec 14 jours gratuits
        </p>
      </div>

      <div style={{ maxWidth: 880, margin: '0 auto', padding: '32px 20px 64px' }}>

        {/* Statut actuel */}
        {(isActive || isTrial) && (
          <div style={{
            background: D.greenLight, border: `1px solid ${D.green}33`,
            borderRadius: 14, padding: '14px 20px', marginBottom: 28,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <span style={{ fontSize: 22 }}>{isTrial ? '🎁' : '✅'}</span>
            <div>
              <div style={{ fontWeight: 700, color: D.green, fontSize: 15 }}>
                {isTrial
                  ? `Essai gratuit en cours — ${daysLeft()} jour${daysLeft() > 1 ? 's' : ''} restant${daysLeft() > 1 ? 's' : ''}`
                  : `Abonnement ${subscription?.plan ?? ''} actif`
                }
              </div>
              <div style={{ fontSize: 13, color: D.text2, marginTop: 2 }}>
                {isTrial
                  ? 'Profitez de toutes les fonctionnalités gratuitement pendant votre essai'
                  : `Renouvellement le ${subscription?.currentPeriodEnd?.toDate?.()?.toLocaleDateString('fr-FR') ?? '–'}`
                }
              </div>
            </div>
          </div>
        )}

        {/* Sélecteur de devise */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <span style={{ fontSize: 13, color: D.text2, fontWeight: 600 }}>Devise :</span>
          {['XOF', 'GHS', 'NGN'].map(cur => (
            <button key={cur} onClick={() => setSelectedCurrency(cur)} style={{
              padding: '5px 16px', borderRadius: 20,
              border: `1.5px solid ${selectedCurrency === cur ? D.orange : D.border}`,
              background: selectedCurrency === cur ? D.orangeDim : D.surface,
              color: selectedCurrency === cur ? D.orange : D.text2,
              fontWeight: selectedCurrency === cur ? 700 : 400,
              fontSize: 13, cursor: 'pointer',
            }}>
              {cur}
            </button>
          ))}
        </div>

        {/* Grille des plans */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
          {PLANS.map(plan => {
            const isSelected = selectedPlan === plan.id;
            return (
              <div key={plan.id} onClick={() => setSelectedPlan(plan.id)} style={{
                background: D.surface, borderRadius: 20, padding: '24px 22px',
                border: `2px solid ${isSelected ? D.orange : (plan.popular ? D.border : D.border)}`,
                boxShadow: isSelected ? `0 4px 20px ${D.orange}22` : 'none',
                cursor: 'pointer', position: 'relative',
                transition: 'all 0.2s',
              }}>
                {/* Badge populaire */}
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: -12, left: '50%',
                    transform: 'translateX(-50%)',
                    background: D.orange, color: '#fff',
                    padding: '3px 14px', borderRadius: 20,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    LE PLUS POPULAIRE
                  </div>
                )}

                {/* En-tête */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 28 }}>{plan.icon}</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: D.text1 }}>{plan.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: isSelected ? D.orange : D.text1, marginTop: 2 }}>
                      {fmtPrice(plan.priceXof, selectedCurrency)}
                      <span style={{ fontSize: 13, fontWeight: 400, color: D.text3 }}> /mois</span>
                    </div>
                  </div>
                </div>

                {/* Features */}
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {plan.features.map(f => (
                    <li key={f} style={{
                      fontSize: 13, color: D.text2, padding: '5px 0',
                      borderBottom: `0.5px solid ${D.border}`,
                      display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                      <span style={{ color: D.green, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* Sélecteur visuel */}
                <div style={{ marginTop: 16, textAlign: 'center' }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', margin: '0 auto',
                    border: `2px solid ${isSelected ? D.orange : D.border}`,
                    background: isSelected ? D.orange : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <span style={{ color: '#fff', fontSize: 12 }}>✓</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA paiement */}
        <div style={{
          background: D.surface, borderRadius: 16, padding: 24,
          border: `1px solid ${D.border}`, maxWidth: 480, margin: '0 auto',
        }}>
          <div style={{ fontSize: 12, color: D.text3, fontWeight: 700, letterSpacing: 1.2, marginBottom: 16 }}>
            RÉCAPITULATIF
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: D.text2 }}>
              Plan {PLANS.find(p => p.id === selectedPlan)?.label}
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: D.text1 }}>
              {fmtPrice(PLANS.find(p => p.id === selectedPlan)?.priceXof ?? 0, selectedCurrency)}
            </span>
          </div>
          <div style={{ fontSize: 11, color: D.text3, marginBottom: 16 }}>
            Renouvellement automatique chaque mois · Résiliable à tout moment
          </div>

          {/* Essai gratuit : info */}
          {status === 'none' && (
            <div style={{
              background: D.amberLight, borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: 12, color: D.amber,
            }}>
              🎁 Première souscription : 14 jours gratuits, aucune carte requise pendant l'essai
            </div>
          )}

          {payError && (
            <div style={{
              background: '#FEE2E2', borderRadius: 10, padding: '10px 14px', marginBottom: 14,
              fontSize: 12, color: D.red,
            }}>
              {payError}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={paying || loading}
            style={{
              width: '100%', padding: '14px 0',
              background: paying ? D.text3 : D.orange,
              color: '#fff', border: 'none', borderRadius: 12,
              fontSize: 15, fontWeight: 700, cursor: paying ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {paying ? '⏳ Redirection…' : `💳 Payer ${fmtPrice(PLANS.find(p => p.id === selectedPlan)?.priceXof ?? 0, selectedCurrency)} / mois`}
          </button>

          <div style={{ fontSize: 11, color: D.text3, marginTop: 10, textAlign: 'center' }}>
            Paiement sécurisé via Flutterwave · Carte, Mobile Money, USSD
          </div>
        </div>

        {/* FAQ rapide */}
        <div style={{ maxWidth: 480, margin: '32px auto 0' }}>
          {[
            ['L\'essai gratuit demande-t-il une carte ?', 'Non. Votre essai de 14 jours est automatiquement activé dès l\'inscription en tant que Vendeur, sans aucune information bancaire.'],
            ['Comment résilier ?', 'Depuis votre espace vendeur → Abonnement → Résilier. L\'accès reste actif jusqu\'à la fin de la période en cours.'],
            ['Puis-je changer de plan ?', 'Oui, à tout moment. Le changement prend effet au prochain cycle de facturation.'],
          ].map(([q, a]) => (
            <details key={q} style={{ marginBottom: 10, background: D.surface, borderRadius: 12, border: `1px solid ${D.border}`, overflow: 'hidden' }}>
              <summary style={{ padding: '14px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: D.text1 }}>
                {q}
              </summary>
              <div style={{ padding: '0 16px 14px', fontSize: 13, color: D.text2, lineHeight: 1.6 }}>
                {a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}