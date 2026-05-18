import styles from './Features.module.css';

const FEATURES = [
  {
    icon: '🎥',
    color: 'orange',
    title: 'Vitrines en vidéo',
    desc: 'Filmez, publiez, vendez. Créez des fiches produits dynamiques qui captent l\'attention et augmentent vos conversions.',
  },
  {
    icon: '📡',
    color: 'coral',
    title: 'Live Shopping',
    desc: 'Vendez en direct devant votre audience. Répondez aux questions, montrez le produit en temps réel et boostez vos ventes.',
  },
  {
    icon: '📦',
    color: 'green',
    title: 'Livraison suivie',
    desc: 'Suivez vos commandes en temps réel. Communication directe entre acheteur et livreur pour une expérience sans friction.',
  },
  {
    icon: '🛒',
    color: 'gold',
    title: 'Dropshipping certifié',
    desc: 'Accédez à un réseau de partenaires certifiés. Vendez sans stock, gérez tout depuis votre tableau de bord FriTok.',
  },
  {
    icon: '🔍',
    color: 'orange',
    title: 'Recherche intelligente',
    desc: 'Trouvez un produit par photo ou par commande vocale. La découverte produit comme vous ne l\'avez jamais vécue.',
  },
  {
    icon: '💬',
    color: 'coral',
    title: 'Messagerie intégrée',
    desc: 'Discutez avec vos clients, livreurs et fournisseurs depuis un seul tableau de bord unifié.',
  },
];

export default function Features() {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2 className={styles.title}>Tout ce qu&apos;il vous faut<br /><span>pour vendre en ligne.</span></h2>
        <p className={styles.sub}>Une plateforme complète, pensée pour les vendeurs africains.</p>
      </div>

      <div className={styles.grid}>
        {FEATURES.map(f => (
          <div key={f.title} className={styles.card}>
            <div className={`${styles.icon} ${styles[`icon_${f.color}`]}`}>
              {f.icon}
            </div>
            <h3 className={styles.cardTitle}>{f.title}</h3>
            <p className={styles.cardDesc}>{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
