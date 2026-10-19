import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function CGU() {
  return (
    <>
      <Head>
        <title>Conditions Générales d’Utilisation – FriTok</title>
        <meta
          name="description"
          content="Conditions Générales d’Utilisation de l’application FriTok, dédiée à la création de vitrines e-commerce interactives."
        />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1>📘 Conditions Générales d’Utilisation – FriTok</h1>
        <p><strong>Dernière mise à jour :</strong> 26 août 2025</p>
        <p>
          Bienvenue sur <strong>FriTok</strong>, une application mobile dédiée à la création de vitrines e-commerce interactives. En téléchargeant ou en utilisant FriTok, vous acceptez les présentes Conditions Générales d’Utilisation (CGU). Veuillez les lire attentivement.
        </p>

        {/* Sommaire */}
        <nav style={{ marginBottom: '2rem' }}>
          <h2>🧭 Sommaire</h2>
          <ul>
            <li><a href="#objet">Objet de l’application</a></li>
            <li><a href="#inscription">Accès et inscription</a></li>
            <li><a href="#fonctionnalites">Fonctionnalités techniques</a></li>
            <li><a href="#commandes">Commandes et livraisons</a></li>
            <li><a href="#communication">Communication entre utilisateurs</a></li>
            <li><a href="#contenu">Contenu utilisateur</a></li>
            <li><a href="#comportement">Comportement interdit</a></li>
            <li><a href="#donnees">Protection des données</a></li>
            <li><a href="#responsabilite">Responsabilité</a></li>
            <li><a href="#modifications">Modifications des CGU</a></li>
            <li><a href="#droit">Droit applicable</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </nav>

        <section id="objet">
          <h2>1. 🧾 Objet de l’application</h2>
          <ul>
            <li>Créer et consulter des vitrines produits sous forme de vidéos et fiches descriptives</li>
            <li>Accéder à des catalogues et services de dropshipping</li>
            <li>Gérer les commandes et livraisons</li>
            <li>Utiliser des outils de recherche par image ou voix</li>
            <li>Faciliter la communication entre livreur et client</li>
          </ul>
        </section>

        <section id="inscription">
          <h2>2. 👤 Accès et inscription</h2>
          <ul>
            <li>Création d’un compte utilisateur requise pour certaines fonctionnalités</li>
            <li>Fourniture d’informations exactes et à jour</li>
            <li>Inscription pouvant nécessiter un numéro de téléphone</li>
            <li>Responsabilité de la confidentialité des identifiants</li>
          </ul>
        </section>

        <section id="fonctionnalites">
          <h2>3. 📱 Fonctionnalités techniques</h2>
          <ul>
            <li>📷 Caméra : recherche par image</li>
            <li>🎤 Microphone : recherche vocale</li>
            <li>📍 Géolocalisation : position du livreur ou de la boutique (sans suivi en temps réel)</li>
            <li>📞 Téléphone : contact entre livreur et client</li>
          </ul>
          <p>L’utilisation de ces fonctionnalités est soumise à l’autorisation explicite de l’utilisateur.</p>
        </section>

        <section id="commandes">
          <h2>4. 📦 Commandes et livraisons</h2>
          <ul>
            <li>Mise en relation entre vendeurs et clients</li>
            <li>Délais de livraison estimés et variables</li>
            <li>FriTok décline toute responsabilité en cas de retard ou erreur causé par des tiers</li>
          </ul>
        </section>

        <section id="communication">
          <h2>5. 💬 Communication entre utilisateurs</h2>
          <p>Les vendeurs et livreurs peuvent contacter les clients via les coordonnées fournies. Toute utilisation abusive ou non sollicitée est strictement interdite.</p>
        </section>

        <section id="contenu">
          <h2>6. 📸 Contenu utilisateur</h2>
          <ul>
            <li>Propriété ou droits nécessaires sur le contenu publié</li>
            <li>Respect des lois et droits de tiers</li>
            <li>Autorisation implicite pour FriTok d’utiliser le contenu à des fins promotionnelles</li>
          </ul>
        </section>

        <section id="comportement">
          <h2>7. 🚫 Comportement interdit</h2>
          <ul>
            <li>Diffusion de contenu illégal, offensant ou trompeur</li>
            <li>Usurpation d’identité</li>
            <li>Perturbation du fonctionnement de l’application</li>
            <li>Collecte de données personnelles sans autorisation</li>
          </ul>
        </section>

        <section id="donnees">
          <h2>8. 🔒 Protection des données</h2>
          <p>Les données personnelles sont traitées conformément à notre <Link href="/politique" style={{ color: '#0070f3', textDecoration: 'underline' }}>Politique de confidentialité</Link>. L’utilisateur peut à tout moment demander l’accès, la modification ou la suppression de ses données.</p>
        </section>

        <section id="responsabilite">
          <h2>9. 🛠 Responsabilité</h2>
          <p>FriTok est fourni « tel quel ». Nous ne garantissons pas :</p>
          <ul>
            <li>L’absence d’erreurs ou de bugs</li>
            <li>La disponibilité continue du service</li>
            <li>La fiabilité des vendeurs ou des produits</li>
          </ul>
          <p>FriTok décline toute responsabilité en cas de perte, dommage ou litige entre utilisateurs.</p>
        </section>

        <section id="modifications">
          <h2>10. 📅 Modifications des CGU</h2>
          <p>FriTok se réserve le droit de modifier les CGU à tout moment. Les utilisateurs seront informés via l’application ou par email. L’utilisation continue de l’application vaut acceptation des nouvelles CGU.</p>
        </section>

        <section id="droit">
          <h2>11. ⚖️ Droit applicable</h2>
          <p>Les présentes CGU sont régies par le droit <strong>ivoirien</strong>. En cas de litige, les tribunaux compétents seront ceux du siège social de FriTok.</p>
        </section>

        <section id="contact">
          <h2>12. 📬 Contact</h2>
          <ul>
            <li>📧 Email : <a href="mailto:contact@fritok.app">contact@fritok.app</a></li>
            <li>🌐 Site : <a href="https://www.fritok.net" target="_blank" rel="noopener noreferrer">www.fritok.net</a></li>
          </ul>
        </section>
      </main>
    </>
  );
}
//

