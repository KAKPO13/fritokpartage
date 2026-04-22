import React from 'react';
import Head from 'next/head';
import Link from 'next/link';



export default function LegalCenterPage() {
  return (
    <>
      <Head>
        <title>Centre juridique – FriTok</title>
        <meta
          name="description"
          content="Accédez à tous les documents légaux de FriTok : confidentialité, CGU, retours, mentions légales et contact."
        />
      </Head>

      <main className="legal-main">
        <h1>📚 Centre juridique – FriTok</h1>
        <p>
          Bienvenue dans l’espace juridique de FriTok, votre application e-commerce dédiée à la création de vitrines interactives, au dropshipping et à la gestion de livraison.
        </p>
        <p>Vous trouverez ici tous les documents légaux qui encadrent l’utilisation de notre service.</p>

        <section aria-label="Politique de confidentialité" style={{ marginTop: '2rem' }}>
          <h2>
            🔐 Politique de confidentialité –{' '}
            <Link href="/politique" style={{ color: '#0070f3', textDecoration: 'underline' }}>
              cliquez ici
            </Link>
          </h2>
          <ul>
            <li>Utilisation de la caméra, du micro et de la géolocalisation</li>
            <li>Traitement du numéro de téléphone pour la livraison</li>
            <li>Droits d’accès, de modification et de suppression</li>
          </ul>
        </section>

        <section aria-label="Conditions Générales d’Utilisation" style={{ marginTop: '2rem' }}>
          <h2>
            📘 Conditions Générales d’Utilisation (CGU) –{' '}
            <Link href="/CGU" style={{ color: '#0070f3', textDecoration: 'underline' }}>
              cliquez ici
            </Link>
          </h2>
          <ul>
            <li>Création de vitrines produits</li>
            <li>Fonctionnement des recherches vocales et visuelles</li>
            <li>Communication entre livreurs et clients</li>
            <li>Comportements interdits et responsabilités</li>
          </ul>
        </section>

        <section aria-label="Politique de retour" style={{ marginTop: '2rem' }}>
          <h2>
            🔁 Politique de retour et de remboursement –{' '}
            <Link href="/retours" style={{ color: '#0070f3', textDecoration: 'underline' }}>
              cliquez ici
            </Link>
          </h2>
          <ul>
            <li>Délai de rétractation</li>
            <li>Produits éligibles</li>
            <li>Modalités de remboursement</li>
            <li>Procédure de demande</li>
          </ul>
        </section>

        <section aria-label="Mentions légales" style={{ marginTop: '2rem' }}>
          <h2>
            🏢 Mentions légales –{' '}
            <Link href="/mentions-legales" style={{ color: '#0070f3', textDecoration: 'underline' }}>
              cliquez ici
            </Link>
          </h2>
          <ul>
            <li>Identité de l’entreprise</li>
            <li>Hébergeur du site</li>
            <li>Propriété intellectuelle</li>
            <li>Responsabilité et droit applicable</li>
          </ul>
        </section>

        <section aria-label="Contact juridique" style={{ marginTop: '2rem' }}>
          <h2>📞 Contact juridique</h2>
          <p>Pour toute question ou demande relative à ces documents :</p>
          <ul>
            <li>
              📧 Email : <a href="mailto:legal@fritok.app">legal@fritok.app</a>
            </li>
            <li>📱 Via l’onglet “Aide” dans l’application</li>
          </ul>
        </section>
      </main>

      <style jsx>{`
        .legal-main {
          padding: 2rem;
          font-family: sans-serif;
          max-width: 800px;
          margin: 0 auto;
        }
      `}</style>
    </>
  );
}
