import React from 'react';
import Head from 'next/head';

export default function Politique() {
  return (
    <>
      <Head>
        <title>Politique de confidentialité – FriTok</title>
        <meta name="description" content="Politique de confidentialité de l'application FriTok, dédiée au e-commerce et à la création de vitrines interactives." />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1>📜 Politique de confidentialité – FriTok</h1>
        <p><strong>Dernière mise à jour :</strong> [à compléter]</p>
        <p>Bienvenue sur <strong>FriTok</strong>, une application mobile dédiée au e-commerce et à la création de vitrines interactives. Cette politique de confidentialité explique comment nous collectons, utilisons, protégeons et partageons les données personnelles des utilisateurs.</p>

        <h2>1. 📦 Activité principale de l’application</h2>
        <ul>
          <li>Créer des vitrines produits sous forme de vidéos et fiches descriptives</li>
          <li>Générer des liens vers des catalogues et des services de dropshipping</li>
          <li>Gérer les commandes et livraisons via des partenaires logistiques</li>
        </ul>

        <h2>2. 📲 Données collectées</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Type de donnée</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Usage</th>
              <th style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Sensibilité</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>📷 Caméra</td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Prise de photo pour recherche par image</td>
              <td style={{ padding: '0.5rem', border: '1px solid #ccc' }}>Donnée sensible</td>
            </tr>
            <tr>
              <td>🎤 Microphone</td>
              <td>Recherche vocale de produits</td>
              <td>Donnée sensible</td>
            </tr>
            <tr>
              <td>📍 Géolocalisation</td>
              <td>Identifier la position du livreur ou de la boutique</td>
              <td>Donnée sensible</td>
            </tr>
            <tr>
              <td>📞 Numéro de téléphone</td>
              <td>Permettre au livreur de contacter le client</td>
              <td>Donnée personnelle</td>
            </tr>
            <tr>
              <td>📄 Fiches produit</td>
              <td>Informations commerciales fournies par les vendeurs</td>
              <td>Donnée publique</td>
            </tr>
            <tr>
              <td>📹 Vidéos</td>
              <td>Présentation des produits par les vendeurs</td>
              <td>Donnée publique</td>
            </tr>
          </tbody>
        </table>

        <h2>3. 🛠 Utilisation des données</h2>
        <ul>
          <li>Permettre la recherche intelligente de produits (image, voix)</li>
          <li>Faciliter la communication entre livreur et client</li>
          <li>Localiser les points de retrait ou de livraison (sans suivi en temps réel)</li>
          <li>Créer et partager des vitrines produits interactives</li>
          <li>Améliorer l’expérience utilisateur et la performance de l’application</li>
        </ul>

        <h2>4. 🔒 Sécurité des données</h2>
        <ul>
          <li>Chiffrement des communications</li>
          <li>Accès restreint aux données sensibles</li>
          <li>Hébergement sécurisé sur des serveurs conformes aux normes internationales</li>
        </ul>

        <h2>5. 🤝 Partage des données</h2>
        <ul>
          <li>Avec les livreurs pour assurer la livraison</li>
          <li>Avec les partenaires dropshipping pour exécuter les commandes</li>
          <li>En cas d’obligation légale ou judiciaire</li>
        </ul>

        <h2>6. 🌍 Conformité aux lois</h2>
        <ul>
          <li>RGPD (Union européenne)</li>
          <li>CCPA/CPRA (Californie, États-Unis)</li>
          <li>Autres lois locales applicables selon votre pays de résidence</li>
        </ul>

        <h2>7. 🧑 Vos droits</h2>
        <ul>
          <li>Accéder à vos données</li>
          <li>Demander leur modification ou suppression</li>
          <li>Retirer votre consentement à tout moment</li>
        </ul>
        <p>Pour exercer ces droits, contactez-nous à : <strong>contact@fritok.app</strong></p>

        <h2>8. 🔄 Modifications</h2>
        <p>Cette politique peut être mise à jour. Toute modification sera publiée dans l’application et sur notre site web.</p>

        <h2>9. 📬 Contact</h2>
        <p>Pour toute question ou demande concernant cette politique :</p>
        <ul>
          <li>📧 Email : <a href="mailto:contact@fritok.app">contact@fritok.app</a></li>
          <li>🌐 Site : <a href="https://www.fritok.net/politique-confidentialite" target="_blank" rel="noopener noreferrer">www.fritok.net/politique-confidentialite</a></li>
        </ul>
      </main>
    </>
  );
}
