import styles from './LiveGrid.module.css';

const LIVES = [
  { title: 'Soldes mode Printemps', seller: '@AminaFashion', viewers: '1.2k', gradient: 'linear-gradient(135deg,#1e3a5f,#0d1b2a)' },
  { title: 'Électronique déstock', seller: '@Youssouf_Elect', viewers: '847', gradient: 'linear-gradient(135deg,#3d1a4f,#1a0d2e)' },
  { title: 'Chaussures & Sneakers', seller: '@KofiSneaks', viewers: '3.1k', gradient: 'linear-gradient(135deg,#4f2d0d,#2e1a0d)' },
  { title: 'Beauté & Soins naturels', seller: '@BeautyByDjamila', viewers: '612', gradient: 'linear-gradient(135deg,#0d3a2e,#0a1e1a)' },
];

export default function LiveGrid() {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>🔴 Lives en cours</h2>
        <span className={styles.seeAll}>Voir tous les lives →</span>
      </div>

      <div className={styles.grid}>
        {LIVES.map(l => (
          <div key={l.seller} className={styles.card}>
            <div className={styles.thumb} style={{ background: l.gradient }}>
              <span className={styles.liveBadge}>LIVE</span>
              <span className={styles.viewers}>👁 {l.viewers}</span>
            </div>
            <div className={styles.info}>
              <div className={styles.liveTitle}>{l.title}</div>
              <div className={styles.seller}>{l.seller}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
