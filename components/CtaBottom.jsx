import Link from 'next/link';
import styles from './CtaBottom.module.css';

export default function CtaBottom() {
  return (
    <section className={styles.section}>
      <h2 className={styles.title}>
        Prêt à lancer<br />
        votre <span>boutique ?</span>
      </h2>
      <p className={styles.desc}>
        Rejoignez des milliers de vendeurs qui développent leur activité avec FriTok.
        Gratuit pour commencer.
      </p>
      <Link href="/register" className={styles.btn}>
        🚀 Créer ma vitrine gratuitement
      </Link>
    </section>
  );
}
