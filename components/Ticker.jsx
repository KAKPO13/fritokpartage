import styles from './Ticker.module.css';

const ITEMS = [
  { icon: '🔴', text: 'Kofi_Store vend en live', detail: '1.2k spectateurs' },
  { icon: '📦', text: 'Commande livrée à Cocody en', detail: '2h' },
  { icon: '🛍️', text: 'AminaFashion vient d\'ouvrir sa vitrine', detail: '' },
  { icon: '⚡', text: 'Nouveau partenaire dropshipping certifié', detail: '' },
  { icon: '🔍', text: 'Recherche par image activée', detail: '' },
  { icon: '📍', text: 'Youssouf_Elect livre maintenant à Treichville', detail: '' },
];

export default function Ticker() {
  const doubled = [...ITEMS, ...ITEMS]; // duplicate for seamless loop

  return (
    <div className={styles.ticker}>
      <div className={styles.inner}>
        {doubled.map((item, i) => (
          <span key={i} className={styles.item}>
            {item.icon} {item.text}{item.detail && <strong> {item.detail}</strong>}
          </span>
        ))}
      </div>
    </div>
  );
}
