// ============================================================
// netlify/functions/notify_transfer.js
// Fonction Netlify déclenchée après un transfert réussi.
// Envoie une notification SMS au destinataire via Twilio.
//
// SETUP :
//  1. npm install twilio dans le dossier netlify/functions
//     (ou à la racine avec package.json)
//  2. Configurer les variables d'environnement dans Netlify UI :
//       TWILIO_ACCOUNT_SID=ACxxxx
//       TWILIO_AUTH_TOKEN=xxxx
//       TWILIO_FROM_NUMBER=+1XXXXXXXXXX
//       NOTIFY_SECRET=un_secret_partage_avec_lapp_flutter
//  3. Déployer sur Netlify
// ============================================================

const twilio = require('twilio');

// ─── Handler principal ────────────────────────────────────────
exports.handler = async function (event, context) {

  // Seulement POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Parse body ────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    txId,
    senderName,
    recipientName,
    recipientPhone,
    amount,
    currency,
  } = payload;

  // ── Validation minimale ───────────────────────────────────
  if (!txId || !recipientPhone || !amount || !currency) {
    return { statusCode: 400, body: 'Missing required fields' };
  }

  // ── Vérification du secret partagé (anti-spam) ────────────
  // L'app Flutter envoie le header X-Notify-Secret
  const secret = event.headers['x-notify-secret'];
  if (secret !== process.env.NOTIFY_SECRET) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // ── Formatage du message SMS ──────────────────────────────
  const formattedAmount = new Intl.NumberFormat('fr-FR').format(amount);
  const message = [
    `💸 FriPay — Vous avez reçu ${formattedAmount} ${currency}`,
    `De : ${senderName || 'Un utilisateur FriPay'}`,
    `Réf. : ${txId.slice(0, 8).toUpperCase()}`,
    `Votre solde a été crédité. Merci !`,
  ].join('\n');

  // ── Envoi SMS Twilio ──────────────────────────────────────
  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
    );

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_FROM_NUMBER,
      to:   recipientPhone,
    });

    console.log(`[notify_transfer] SMS sent to ${recipientPhone} for tx ${txId}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, txId }),
    };

  } catch (err) {
    // On log l'erreur mais on renvoie 200 pour ne pas bloquer l'app
    // (la transaction Firestore est déjà confirmée)
    console.error('[notify_transfer] Twilio error:', err.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ success: false, error: err.message }),
    };
  }
};


// ============================================================
// firestore.rules — Règles de sécurité Firestore
// Copiez ce contenu dans votre fichier firestore.rules
// et déployez avec : firebase deploy --only firestore:rules
// ============================================================

/*
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── Helpers ─────────────────────────────────────────────
    function isAuth() {
      return request.auth != null;
    }

    function isOwner(uid) {
      return request.auth.uid == uid;
    }

    function validAmount(amount) {
      return amount is number && amount > 0 && amount <= 10000000;
    }

    // ── Users ────────────────────────────────────────────────
    // Lecture: soi-même uniquement
    // Écriture: soi-même uniquement, pas de modification du wallet directement
    match /users/{userId} {
      allow read: if isAuth() && isOwner(userId);

      // L'app peut lire le téléphone pour la recherche de destinataire
      allow read: if isAuth()
        && resource.data.keys().hasOnly(['phone', 'displayName', 'photoUrl']);

      // Interdire toute écriture directe sur le wallet depuis le client
      allow write: if isAuth()
        && isOwner(userId)
        && !request.resource.data.diff(resource.data).affectedKeys()
              .hasAny(['wallet']);

      // Favoris utilisateur
      match /user_favorites/{favId} {
        allow read, write: if isAuth() && isOwner(userId);
      }
    }

    // ── Transferts ───────────────────────────────────────────
    // Lecture: expéditeur ou destinataire uniquement
    // Création: uniquement par l'expéditeur authentifié
    // Pas de modification ni suppression côté client
    match /TransfetMoney/{txId} {
      allow read: if isAuth()
        && (resource.data.expediteurId == request.auth.uid
         || resource.data.destinataireId == request.auth.uid);

      allow create: if isAuth()
        && request.resource.data.expediteurId == request.auth.uid
        && validAmount(request.resource.data.montantEnvoye)
        && request.resource.data.montantEnvoye >= 100
        && request.resource.data.status == 'completed';

      allow update, delete: if false;
    }

    // ── Journal wallet ────────────────────────────────────────
    match /wallet_transactions/{txId} {
      allow read: if isAuth()
        && resource.data.userId == request.auth.uid;
      allow create: if isAuth()
        && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }

    // ── Revenus plateforme ────────────────────────────────────
    // Écriture autorisée depuis le client (dans la transaction),
    // lecture interdite au client
    match /platform_revenue/{txId} {
      allow read: if false;
      allow create: if isAuth();
      allow update, delete: if false;
    }

    // ── Produits / boutiques ──────────────────────────────────
    match /products/{productId} {
      allow read: if isAuth();
      allow write: if isAuth()
        && request.resource.data.userIdVend == request.auth.uid;
    }

    // ── Commandes ─────────────────────────────────────────────
    match /commandes/{cmdId} {
      allow read: if isAuth()
        && (resource.data.acheteurId == request.auth.uid
         || resource.data.vendeurId == request.auth.uid);
      allow create: if isAuth();
      allow update: if isAuth()
        && (resource.data.vendeurId == request.auth.uid
         || resource.data.acheteurId == request.auth.uid);
      allow delete: if false;
    }
  }
}
*/
