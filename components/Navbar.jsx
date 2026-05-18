'use client';

import Link from 'next/link';
import styles from './Navbar.module.css';

export default function Navbar() {
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.logo}>
        Fri<span>Tok</span>
      </Link>

      <ul className={styles.links}>
        <li><Link href="/sell">Vendre</Link></li>
        <li><Link href="/live">Live</Link></li>
        <li><Link href="/delivery">Livraison</Link></li>
        <li><Link href="/dropshipping">Dropshipping</Link></li>
      </ul>

      <Link href="/register" className={styles.cta}>
        Commencer gratuitement
      </Link>
    </nav>
  );
}
