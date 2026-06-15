'use client';
import Link from 'next/link';

const D = {
  orange   : '#FF6B00',
  orangeDim: '#FFEDD5',
  zest     : '#FFB700',
  text1    : '#2D1500',
  text2    : '#8B5E3C',
  border   : '#FFDDB0',
};

export default function AppBanner() {
  return (
    <section style={{ padding: '0 24px 40px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{
        background: `linear-gradient(135deg, ${D.orange}, ${D.zest})`,
        borderRadius: 24,
        padding: '28px 32px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Deco circles */}
        <div style={{ position: 'absolute', top: -40, right: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.09)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -30, left: 60, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 700, letterSpacing: 1.5, marginBottom: 6 }}>
            SANS TÉLÉCHARGER L'APP ✦
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 4 }}>
            Loue depuis ton navigateur
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.80)' }}>
            Carte, paiement, restitution — tout en ligne.
          </div>
        </div>

        <Link href="/app" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: '#fff', color: D.orange, fontWeight: 800, fontSize: 14,
          padding: '12px 24px', borderRadius: 12, textDecoration: 'none',
          flexShrink: 0, whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,0.14)',
        }}>
          Accéder à l'app web →
        </Link>
      </div>
    </section>
  );
}
