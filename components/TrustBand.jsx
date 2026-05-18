import styles from './TrustBand.module.css';

const BADGES = [
  '🔒 Loi n° 2013-450 Côte d\'Ivoire',
  '🌍 RGPD',
  '🇺🇸 CCPA',
  '🛡️ Paiements sécurisés',
  '✅ Partenaires certifiés',
];

export default function TrustBand() {
  return (
    <div className={styles.band}>
      <p className={styles.label}>
        Conforme à la réglementation ivoirienne et aux normes internationales
      </p>
      <div className={styles.badges}>
        {BADGES.map(b => (
          <span key={b} className={styles.badge}>{b}</span>
        ))}
      </div>
    </div>
  );
}
