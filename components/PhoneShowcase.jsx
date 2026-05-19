'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './PhoneShowcase.module.css';

const PRODUCTS = [
  { name: 'Chaussures Nike Air Max', price: '28 000 CFA', live: true, viewers: '1.2k', gradient: 'linear-gradient(160deg,#1a0a00,#3d1a00,#5c2800)' },
  { name: 'Sac en cuir artisanal', price: '45 000 CFA', live: false, viewers: '', gradient: 'linear-gradient(160deg,#001a2e,#003d5c,#004f7a)' },
  { name: 'Montre connectée', price: '62 000 CFA', live: true, viewers: '847', gradient: 'linear-gradient(160deg,#1a001a,#3d003d,#5c005c)' },
];

const PILLS = ['🎥 Vitrines vidéo', '📡 Live shopping', '🔍 Recherche visuelle', '🎙️ Recherche vocale', '💬 Messagerie intégrée'];

export default function PhoneShowcase() {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrent(c => (c + 1) % PRODUCTS.length), 2800);
    return () => clearInterval(id);
  }, []);

  const product = PRODUCTS[current];

  return (
    <section className={styles.section}>
      {/* Phone mockup */}
      <div className={styles.phoneWrap}>
        <div className={styles.phone}>
          <div className={styles.notch} />
          <div className={styles.screen} style={{ background: product.gradient }}>
            <div className={styles.overlay} />
            {product.live && <span className={styles.liveBadge}>LIVE</span>}
            {product.viewers && (
              <span className={styles.viewers}>👁 {product.viewers}</span>
            )}
            <div className={styles.actions}>
              {['❤️', '💬', '🛒', '↗️'].map(a => (
                <div key={a} className={styles.actionBtn}>{a}</div>
              ))}
            </div>
            <div className={styles.info}>
              <div className={styles.productName}>{product.name}</div>
              <div className={styles.productPrice}>₣ {product.price}</div>
            </div>
          </div>
        </div>

        {/* Dots indicator */}
        <div className={styles.dots}>
          {PRODUCTS.map((_, i) => (
            <button
              key={i}
              className={`${styles.dot} ${i === current ? styles.dotActive : ''}`}
              onClick={() => setCurrent(i)}
              aria-label={`Produit ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Text side */}
      <div className={styles.text}>
        <h2 className={styles.heading}>
          Vos produits méritent<br />
          <span className={styles.accent}>d&apos;être vus.</span>
        </h2>
        <p className={styles.desc}>
          Créez des fiches produits en vidéo comme sur TikTok. Vendez en direct avec le
          live shopping. Vos clients découvrent, commandent et suivent — tout sur FriTok.
        </p>
        <div className={styles.pills}>
          {PILLS.map(p => (
            <span key={p} className={styles.pill}>{p}</span>
          ))}
        </div>
        <Link href="/register" className={styles.cta}>
          Créer ma vitrine gratuitement →
        </Link>
      </div>
    </section>
  );
}
