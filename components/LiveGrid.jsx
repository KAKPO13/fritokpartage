'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import styles from './LiveGrid.module.css';

const GRADIENTS = [
  'linear-gradient(135deg,#1e3a5f,#0d1b2a)',
  'linear-gradient(135deg,#3d1a4f,#1a0d2e)',
  'linear-gradient(135deg,#4f2d0d,#2e1a0d)',
  'linear-gradient(135deg,#0d3a2e,#0a1e1a)',
];

export default function LiveGrid() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const q = query(
          collection(db, 'live_sessions'),
          orderBy('startedAt', 'desc'),
          limit(4)
        );
        const snap = await getDocs(q);
        setSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('LiveGrid:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>🔴 Lives en cours</h2>
        <Link href="/live" className={styles.seeAll}>Voir tous →</Link>
      </div>

      <div className={styles.grid}>
        {loading
          ? [1,2,3,4].map(i => <div key={i} className={styles.skeleton} />)
          : sessions.map((s, i) => {
              const firstProduct = s.products?.[0];
              const gradient = GRADIENTS[i % GRADIENTS.length];
              return (
                <Link key={s.id} href="/live" className={styles.card}>
                  <div className={styles.thumb} style={{ background: gradient }}>
                    {firstProduct?.image && (
                      <img src={firstProduct.image} alt="" className={styles.thumbImg}
                        onError={e => { e.currentTarget.style.display = 'none'; }} />
                    )}
                    {s.isLive
                      ? <span className={styles.liveBadge}>LIVE</span>
                      : <span className={styles.replayBadge}>REPLAY</span>
                    }
                    <span className={styles.viewers}>👁 {s.viewerCount ?? 0}</span>
                  </div>
                  <div className={styles.info}>
                    <div className={styles.liveTitle}>{firstProduct?.name ?? 'Live shopping'}</div>
                    <div className={styles.seller}>{s.sellerName ?? 'Vendeur'}</div>
                  </div>
                </Link>
              );
            })
        }
      </div>
    </section>
  );
}
