// pages/_document.js
// -----------------------------------------------------------------------------
// ⚠️ Si un pages/_document.js existe déjà dans le projet, NE PAS écraser —
// fusionner ce <script> dans le <body> existant, juste avant </Main /> et
// <NextScript />, en conservant tes éventuelles balises meta / fonts / etc.
//
// Placement volontairement identique aux instructions officielles KkiaPay :
// script chargé une seule fois, globalement, juste avant la fermeture de
// </body> — disponible sur toutes les pages sans avoir à l'injecter
// dynamiquement page par page (cf. app/hooks/useKkiapay.js, simplifié en
// conséquence).
// -----------------------------------------------------------------------------

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="fr">
      <Head />
      <body>
        <Main />
        <NextScript />
        <script src="https://cdn.kkiapay.me/k.js"></script>
      </body>
    </Html>
  );
}