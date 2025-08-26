import React from 'react';
import Head from 'next/head';
import Link from 'next/link';

export default function MentionsLegales() {
  return (
    <>
      <Head>
        <title>Mentions légales – FriTok</title>
        <meta
          name="description"
          content="Mentions légales de l’application FriTok, incluant l’identité de l’éditeur, l’hébergement, la propriété intellectuelle et les responsabilités."
        />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1>📘 Mentions légales – FriTok</h1>
        <p><strong>Dernière mise à jour :</strong> 26 août 2025</p>
        <p>
          Conformément aux dispositions des lois en vigueur, notamment la Loi n° 2013-450 relative à la protection des données personnelles en Côte d’Ivoire et les réglementations internationales (RGPD, CCPA), les présentes mentions légales précisent l’identité de l’éditeur de l’application FriTok, les conditions d’utilisation, et les droits des utilisateurs.
        </p>

        <section id="editeur">
          <h2>1. 🏢 Éditeur de l’application</h2>
          <ul>
            <li><strong>Nom de l’entreprise :</strong> FriTok Technologies</li>
            <li><strong>Forme juridique :</strong> SARL</li>
            <li><strong>Adresse du siège social :</strong> Cocody Angré 7e Tranche, Abidjan, Côte d’Ivoire</li>
            <li><strong>Numéro d’immatriculation :</strong> CI-ABJ-2025-B-12345</li>
            <li><strong>Responsable de la publication :</strong> KAKPO Coffi Gabriel</li>
            <li><strong>Contact :</strong> <a href="mailto:contact@fritok.app">contact@fritok.app</a></li>
          </ul>
        </section>

        <section id="hebergement">
          <h2>2. 🖥 Hébergement</h2>
          <ul>
            <li><strong>Hébergeur :</strong> Netlify</li>
            <li><strong>Adresse :</strong> 2325 3rd Street, Suite 296, San Francisco, CA 94107, USA</li>
            <li><strong>Téléphone :</strong> +1 844-899-7312</li>
          </ul>
        </section>

        <section id="propriete">
          <h2>3. 📱 Propriété intellectuelle</h2>
          <p>
            Tous les éléments de l’application FriTok (textes, images, vidéos, logos, interface, code source) sont protégés par le droit de la propriété intellectuelle. Toute reproduction, représentation ou exploitation sans autorisation est strictement interdite.
          </p>
        </section>

        <section id="donnees">
          <h2>4. 🔐 Données personnelles</h2>
          <p>
            FriTok collecte et traite des données personnelles conformément à sa <Link href="/politique" style={{ color: '#0070f3', textDecoration: 'underline' }}>Politique de confidentialité</Link>. L’utilisateur dispose d’un droit d’accès, de rectification, de suppression et d’opposition à ses données.
          </p>
        </section>

        <section id="responsabilite">
          <h2>5. ⚖️ Responsabilité</h2>
          <p>FriTok met tout en œuvre pour assurer la fiabilité des informations et services proposés. Toutefois, l’éditeur ne saurait être tenu responsable :</p>
          <ul>
            <li>Des erreurs ou omissions dans les contenus</li>
            <li>Des interruptions ou dysfonctionnements techniques</li>
            <li>Des dommages directs ou indirects liés à l’utilisation de l’application</li>
          </ul>
        </section>

        <section id="conditions">
          <h2>6. 📄 Conditions d’utilisation</h2>
          <p>
            L’utilisation de l’application est soumise aux <Link href="/cgu" style={{ color: '#0070f3', textDecoration: 'underline' }}>Conditions Générales d’Utilisation</Link>. En téléchargeant ou en accédant à FriTok, l’utilisateur accepte ces conditions sans réserve.
          </p>
        </section>

        <section id="droit">
          <h2>7. 🧾 Droit applicable</h2>
          <p>
            Les présentes mentions légales sont régies par le droit <strong>ivoirien</strong>. En cas de litige, les tribunaux compétents seront ceux du siège social de l’éditeur.
          </p>
        </section>
      </main>
    </>
  );
}
