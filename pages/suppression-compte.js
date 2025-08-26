import React from 'react';
import Head from 'next/head';

export default function SuppressionCompte() {
  return (
    <>
      <Head>
        <title>Suppression de compte – FriTok</title>
        <meta
          name="description"
          content="Demandez la suppression de votre compte FriTok et des données personnelles associées conformément à notre politique de confidentialité."
        />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1>🗑️ Suppression de compte – FriTok</h1>
        <p><strong>Dernière mise à jour :</strong> 26 août 2025</p>

        <section>
          <h2>📱 À propos de FriTok</h2>
          <p>
            FriTok est une application e-commerce interactive développée par <strong>FriTok Technologies</strong>, permettant la création de vitrines produits, le dropshipping et la gestion de livraison.
          </p>
        </section>

        <section>
          <h2>🧾 Procédure de suppression</h2>
          <p>Pour demander la suppression de votre compte et des données associées, veuillez envoyer une demande à :</p>
          <ul>
            <li>📧 Email : <a href="mailto:suppression@fritok.app">suppression@fritok.app</a></li>
            <li>📱 Ou via l’onglet “Aide” dans l’application FriTok</li>
          </ul>
          <p>Incluez :</p>
          <ul>
            <li>Votre identifiant utilisateur ou numéro de commande</li>
            <li>L’adresse email associée à votre compte</li>
            <li>Une confirmation explicite de votre souhait de supprimer le compte</li>
          </ul>
        </section>

        <section>
          <h2>🔐 Données supprimées</h2>
          <ul>
            <li>Informations de profil (nom, email, téléphone)</li>
            <li>Historique de commandes et interactions</li>
            <li>Contenus publiés (vitrines, commentaires, etc.)</li>
          </ul>
          <p>Les données conservées temporairement :</p>
          <ul>
            <li>Factures et preuves de transaction (jusqu’à 5 ans)</li>
            <li>Logs techniques anonymisés</li>
          </ul>
        </section>

        <section>
          <h2>⏳ Délai de traitement</h2>
          <p>La suppression sera effective dans un délai de <strong>7 jours ouvrés</strong> après validation. Une confirmation vous sera envoyée par email.</p>
        </section>

        <section>
          <h2>⚖️ Droit applicable</h2>
          <p>Cette procédure est conforme à la Loi n° 2013-450 en Côte d’Ivoire, ainsi qu’aux réglementations internationales (RGPD, CCPA).</p>
        </section>

        <footer style={{ textAlign: 'center', marginTop: '4rem', fontSize: '0.9rem', color: '#888' }}>
          © {new Date().getFullYear()} FriTok Technologies – Tous droits réservés
        </footer>
      </main>
    </>
  );
}
