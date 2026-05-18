import Link from 'next/link';
import styles from './Hero.module.css';

export default function Hero() {
  return (
    <section className={styles.hero}>
      <div className={styles.badge}>
        <span className={styles.liveDot} />
        Ventes en live disponibles maintenant
      </div>

      <h1 className={styles.title}>
        Vendez en vidéo.<br />
        <span className={styles.accent}>Livrez vite.</span>
        <span className={styles.sub}>L&apos;e-commerce made in Afrique.</span>
      </h1>

      <p className={styles.desc}>
        FriTok transforme vos produits en vitrines interactives — vidéos, live shopping,
        recherche vocale et suivi de livraison en un seul endroit.
      </p>

      <div className={styles.actions}>
        <Link href="/register" className={styles.btnPrimary}>
          🚀 Créer ma vitrine
        </Link>
        <Link href="/demo" className={styles.btnSecondary}>
          ▶ Voir une démo live
        </Link>
      </div>
    </section>
  );
}
