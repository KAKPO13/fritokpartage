// netlify/functions/createFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
// Crée un lien de paiement Flutterwave pour une location de power bank.
// La clé secrète FLW ne sort JAMAIS du serveur.
//
// POST body : {
//   powerBankId    : string,   // QR code sticker  ex: "PB-ABJ-000193"
//   powerBankDocId : string,   // doc ID Firestore  ex: "PB-ABJ-000193"
//   partnerStartId : string,   // UID partenaire
//   amountXof      : number,   // frais en XOF      ex: 100
//   cautionXof     : number,   // caution en XOF    ex: 200
//   devise         : string,   // 'XOF'|'GHS'|'NGN'
//   amountDevise   : number,   // frais dans la devise
//   cautionDevise  : number,   // caution dans la devise
// }
//
// Réponse : { payment_url, payment_ref }
//   payment_ref = identifiant interne Fritok à sauvegarder dans Rental
// ─────────────────────────────────────────────────────────────────────────────

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth }      = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

function paymentRef(pbId) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand  = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PB-PAY-${rand}`;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin' : '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type'                : 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    // 1. Auth Firebase
    const token = (event.headers.authorization || '').replace('Bearer ', '');
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Token manquant' }) };

    const app     = getAdminApp();
    const decoded = await getAuth(app).verifyIdToken(token);
    const uid     = decoded.uid;

    // 2. Profil utilisateur
    const db       = getFirestore(app);
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Utilisateur introuvable' }) };
    const user = userSnap.data();

    // 3. Valider body
    let body;
    try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body invalide' }) }; }

    const {
      powerBankId, powerBankDocId, partnerStartId,
      amountXof, cautionXof,
      devise = 'XOF', amountDevise, cautionDevise,
    } = body;

    if (!powerBankId || !amountXof || !cautionXof) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paramètres manquants' }) };
    }

    // 4. Vérifier que le power bank est bien disponible (sécurité serveur)
    const pbRef  = powerBankDocId || powerBankId;
    const pbSnap = await db.collection('powerBanks').doc(pbRef).get();
    if (!pbSnap.exists) {
      // Essaie par champ qrCode
      const qSnap = await db.collection('powerBanks').where('qrCode', '==', powerBankId).limit(1).get();
      if (qSnap.empty) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Power bank introuvable' }) };
      const realDoc = qSnap.docs[0];
      if (realDoc.data().state !== 'disponible') return { statusCode: 409, headers, body: JSON.stringify({ error: 'Power bank non disponible' }) };
    } else if (pbSnap.data().state !== 'disponible') {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'Power bank non disponible' }) };
    }

    // 5. Générer la référence de paiement
    const ref     = paymentRef(powerBankId);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    // Montants dans la devise choisie
    const totalDevise = (amountDevise  ?? amountXof)  + (cautionDevise ?? cautionXof);
    const totalXof    = amountXof + cautionXof;

    const flwPayload = {
      tx_ref      : ref,
      amount      : devise === 'XOF' ? totalXof : totalDevise,
      currency    : devise,
      redirect_url: `${baseUrl}/app/payment-confirm?ref=${ref}&pb=${encodeURIComponent(powerBankId)}`,
      customer    : {
        email      : user.email || decoded.email || '',
        phonenumber: user.phone || '',
        name       : user.username || uid,
      },
      customizations: {
        title      : 'Location Power Bank Fritok',
        description: `Location ${powerBankId} · Frais + Caution`,
        logo       : `${baseUrl}/logo.png`,
      },
      // Subaccount partenaire (split paiement si configuré)
      ...(user.flutterwave_subaccount_id
        ? { subaccounts: [{ id: user.flutterwave_subaccount_id }] }
        : {}),
      meta: {
        userId        : uid,
        powerBankId,
        powerBankDocId: pbRef,
        partnerStartId: partnerStartId || '',
        amountXof     : Number(amountXof),
        cautionXof    : Number(cautionXof),
        devise,
        type          : 'rental',
      },
    };

    const flwRes  = await fetch('https://api.flutterwave.com/v3/payments', {
      method : 'POST',
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body   : JSON.stringify(flwPayload),
    });
    const flwData = await flwRes.json();

    if (flwData.status !== 'success' || !flwData.data?.link) {
      console.error('FLW error:', flwData);
      return { statusCode: 502, headers, body: JSON.stringify({ error: flwData.message || 'Erreur Flutterwave' }) };
    }

    // 6. Pré-enregistrer la transaction en attente
    await db.collection('pendingRentalPayments').doc(ref).set({
      userId        : uid,
      paymentRef    : ref,
      powerBankId,
      powerBankDocId: pbRef,
      partnerStartId: partnerStartId || null,
      amountXof     : Number(amountXof),
      cautionXof    : Number(cautionXof),
      devise,
      amountDevise  : amountDevise  ?? amountXof,
      cautionDevise : cautionDevise ?? cautionXof,
      status        : 'pending',
      createdAt     : new Date(),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        payment_url : flwData.data.link,
        payment_ref : ref,
      }),
    };

  } catch (err) {
    console.error('createFlutterwaveRentalPayment error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erreur interne' }) };
  }
};