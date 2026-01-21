
'use client';
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function Accueil() {
  return (
    <>
      <Head>
        <title>Accueil – FriTok</title>
        <meta
          name="description"
          content="Bienvenue sur FriTok, votre plateforme e-commerce interactive dédiée au dropshipping, à la création de vitrines produits et à la gestion simplifiée des livraisons."
        />
      </Head>

      <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
        <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
          <h1 style={{ fontSize: '2.5rem' }}>✨ Bienvenue sur <span style={{ color: '#0070f3' }}>FriTok</span></h1>
          <p style={{ fontSize: '1.2rem', color: '#555' }}>
            Créez votre vitrine e-commerce interactive, gérez vos livraisons et développez votre activité en toute simplicité.
          </p>
          <Link href="/inscription">
            <a style={{
              display: 'inline-block',
              marginTop: '1rem',
              padding: '0.8rem 1.5rem',
              backgroundColor: '#0070f3',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontWeight: 'bold'
            }}>
              Commencer maintenant
            </a>
          </Link>
        </header>

        <section style={{ marginBottom: '3rem' }}>
          <h2>🚀 Fonctionnalités clés</h2>
          <ul style={{ lineHeight: '1.8' }}>
            <li>🎥 Création de vitrines produits en vidéo</li>
            <li>🔍 Recherche par image et voix</li>
            <li>📦 Dropshipping avec partenaires certifiés</li>
            <li>📍 Suivi simplifié des livraisons</li>
            <li>💬 Communication directe entre client et livreur</li>
          </ul>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2>🛒 Pourquoi choisir FriTok ?</h2>
          <p>
            révolutionne l’expérience d’achat en ligne en combinant technologie, simplicité et proximité. Que vous soyez vendeur ou acheteur, notre plateforme vous offre une interface intuitive et des outils puissants pour réussir.
          </p>
        </section>

        <section style={{ marginBottom: '3rem' }}>
          <h2>📚 Informations légales</h2>
          <ul>
            <li><Link href="/politique"><a style={{ color: '#0070f3' }}>Politique de confidentialité</a></Link></li>
            <li><Link href="/cgu"><a style={{ color: '#0070f3' }}>Conditions Générales d’Utilisation</a></Link></li>
            <li><Link href="/retours"><a style={{ color: '#0070f3' }}>Politique de retour</a></Link></li>
            <li><Link href="/mentions-legales"><a style={{ color: '#0070f3' }}>Mentions légales</a></Link></li>
          </ul>
        </section>

        <footer style={{ textAlign: 'center', marginTop: '4rem', fontSize: '0.9rem', color: '#888' }}>
          © {new Date().getFullYear()} FriTok Technologies – Tous droits réservés
        </footer>
      </main>
    </>
  );
}
