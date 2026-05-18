import Link from 'next/link';
import styles from './Footer.module.css';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.logo}>
        Fri<span>Tok</span> Technologies
      </div>
      <p className={styles.copy}>© {year} FriTok Technologies – Tous droits réservés</p>
      <div className={styles.links}>
        <Link href="/privacy">Confidentialité</Link>
        <Link href="/terms">CGU</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </footer>
  );
}
