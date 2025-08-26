import React from 'react';
import Head from 'next/head';

export default function Retours() {
  return (
    <>
      <Head>
        <title>Politique de retour et de remboursement – FriTok</title>
        <meta
          name="description"
          content="Découvrez les conditions de retour et de remboursement des produits achetés via l’application FriTok."
        />
      </Head>

      <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto' }}>
        <h1>🔁 Politique de retour et de remboursement – FriTok</h1>
        <p><strong>Dernière mise à jour :</strong> 26 août 2025</p>
        <p>
          Chez <strong>FriTok</strong>, nous nous engageons à offrir une expérience d’achat fiable et transparente. Cette politique définit les conditions dans lesquelles les clients peuvent demander un retour ou un remboursement.
        </p>

        <section id="produits">
          <h2>1. 📦 Produits concernés</h2>
          <p>
            Les retours et remboursements sont applicables uniquement aux produits physiques achetés via l’application FriTok, à l’exclusion des services numériques ou des contenus virtuels.
          </p>
        </section>

        <section id="delai">
          <h2>2. ⏳ Délai de retour</h2>
          <p>
            Les clients disposent d’un délai de <strong>7 à 14 jours</strong> à compter de la réception du produit pour effectuer une demande de retour ou de remboursement.
            Passé ce délai, aucune demande ne pourra être acceptée, sauf en cas de produit défectueux ou non conforme.
          </p>
        </section>

        <section id="conditions">
          <h2>3. 📋 Conditions d’éligibilité</h2>
          <p>Pour qu’un retour soit accepté, le produit doit :</p>
          <ul>
            <li>Être dans son état d’origine, non utilisé et non endommagé</li>
            <li>Être retourné dans son emballage d’origine</li>
            <li>Être accompagné de la preuve d’achat (facture ou numéro de commande)</li>
          </ul>
          <p>Les produits suivants ne sont pas remboursables :</p>
          <ul>
            <li>Articles personnalisés ou sur mesure</li>
            <li>Produits consommables (cosmétiques, denrées, etc.)</li>
            <li>Produits soldés ou en promotion (sauf défaut)</li>
          </ul>
        </section>

        <section id="frais">
          <h2>4. 🚚 Frais de retour</h2>
          <p>Les frais de retour sont à la charge du client, sauf en cas de :</p>
          <ul>
            <li>Produit défectueux</li>
            <li>Erreur de livraison</li>
            <li>Produit non conforme à la description</li>
          </ul>
        </section>

        <section id="modalites">
          <h2>5. 💸 Modalités de remboursement</h2>
          <p>
            Une fois le produit retourné et inspecté, le remboursement sera effectué dans un délai de <strong>5 à 10 jours ouvrés</strong> selon le mode de paiement initial.
          </p>
          <ul>
            <li>Le remboursement peut être total ou partiel selon l’état du produit</li>
            <li>En cas de paiement par carte bancaire, le délai dépend de la banque du client</li>
            <li>Aucun remboursement en espèces ne sera effectué</li>
          </ul>
        </section>

        <section id="dropshipping">
          <h2>6. 🛍 Produits en dropshipping</h2>
          <p>Certains produits sont expédiés directement par des partenaires tiers. Dans ce cas :</p>
          <ul>
            <li>Les délais de retour peuvent varier</li>
            <li>Le remboursement est soumis aux conditions du fournisseur</li>
            <li>FriTok agit en tant qu’intermédiaire pour faciliter la procédure</li>
          </ul>
        </section>

        <section id="procedure">
          <h2>7. 📞 Procédure de demande</h2>
          <p>Pour initier un retour ou un remboursement, veuillez contacter notre service client via :</p>
          <ul>
            <li>📧 Email : <a href="mailto:support@fritok.app">support@fritok.app</a></li>
            <li>📱 Via l’onglet “Aide” dans l’application</li>
          </ul>
          <p>Veuillez fournir :</p>
          <ul>
            <li>Le numéro de commande</li>
            <li>Une photo du produit (si défectueux ou non conforme)</li>
            <li>Une brève description du problème</li>
          </ul>
        </section>

        <section id="droit">
          <h2>8. ⚖️ Droit applicable</h2>
          <p>
            Cette politique est régie par le droit <strong>ivoirien</strong>. En cas de litige, les tribunaux compétents seront ceux du siège social de FriTok.
          </p>
        </section>
      </main>
    </>
  );
}
