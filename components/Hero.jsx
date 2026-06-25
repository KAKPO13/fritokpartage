import Link from 'next/link';
import styles from './Hero.module.css';
import EnableNotificationsButton from './EnableNotificationsButton';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.badge}>
        <span className={styles.liveDot} />
        Ventes en live disponibles maintenant
      </div>

      <h1 className={styles.title}>
        Vendez en vidéo.
        <br />
        <span className={styles.accent}>Livrez vite.</span>
        <span className={styles.sub}>
          L&apos;e-commerce made in Afrique.
        </span>
      </h1>

      <p className={styles.desc}>
        FriTok transforme vos produits en vitrines interactives —
        vidéos, live shopping, recherche vocale et suivi de livraison
        en un seul endroit.
      </p>

      <div className={styles.actions}>
        <Link
          href="/register"
          className={styles.btnPrimary}
        >
          🚀 Créer ma vitrine
        </Link>

        <Link
          href="/demo"
          className={styles.btnSecondary}
        >
          ▶ Voir une vidéo produit
        </Link>
      </div>

      {/* Notifications Push */}
      <div
        style={{
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <EnableNotificationsButton />
      </div>

      <p
        style={{
          marginTop: '10px',
          fontSize: '14px',
          opacity: 0.8,
          textAlign: 'center',
        }}
      >
        🔴 Soyez alerté lorsqu'un vendeur démarre un live,
        reçoit une promotion ou publie un nouveau produit.
      </p>
    </section>
  );
}
