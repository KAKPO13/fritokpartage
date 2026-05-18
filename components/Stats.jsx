import styles from './Stats.module.css';

const STATS = [
  { num: '12k+', label: 'Vendeurs actifs' },
  { num: '98%', label: 'Livraisons réussies' },
  { num: '4.2h', label: 'Délai moyen de livraison' },
  { num: '50+', label: 'Partenaires certifiés' },
];

export default function Stats() {
  return (
    <div className={styles.stats}>
      {STATS.map(s => (
        <div key={s.label} className={styles.stat}>
          <div className={styles.num}>{s.num}</div>
          <div className={styles.label}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
