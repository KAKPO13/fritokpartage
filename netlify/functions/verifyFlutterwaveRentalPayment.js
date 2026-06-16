// netlify/functions/verifyFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
// Vérifie une transaction Flutterwave CÔTÉ SERVEUR et crée la Rental
// dans Firestore si tout est correct.
//
// JAMAIS se fier au statut renvoyé par le client — toujours vérifier
// avec la clé secrète via l'API FLW.
//
// POST body : { paymentRef: string, transactionId: string }
//
// Flow :
//   1. Vérifie l'ID token Firebase
//   2. Récupère la transaction FLW via GET /transactions/:id/verify
//   3. Compare tx_ref et montant avec pendingRentalPayments
//   4. Si OK :
//      • crée le document Rental dans Firestore
//      • met le powerBank.state → "en_location"
//      • met pendingRentalPayments.status → "completed"
//   5. Retourne { verified: true, rentalId }
// ─────────────────────────────────────────────────────────────────────────────

const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth }      = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

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

    // 2. Body
    let body;
    try { body = JSON.parse(event.body); } catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Body invalide' }) }; }

    const { paymentRef, transactionId } = body;
    if (!paymentRef || !transactionId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'paymentRef et transactionId requis' }) };
    }

    // 3. Vérifier avec l'API Flutterwave (clé secrète côté serveur uniquement)
    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    });
    const flwData = await flwRes.json();

    if (flwData.status !== 'success') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ verified: false, error: flwData.message || 'Vérification FLW échouée' }),
      };
    }

    const tx = flwData.data;

    // 4. Récupérer la pré-commande depuis Firestore
    const db          = getFirestore(app);
    const pendingSnap = await db.collection('pendingRentalPayments').doc(paymentRef).get();

    if (!pendingSnap.exists) {
      return { statusCode: 200, headers, body: JSON.stringify({ verified: false, error: 'Transaction de référence introuvable' }) };
    }
    const pending = pendingSnap.data();

    // 5. Contrôles de sécurité
    if (pending.userId !== uid) {
      return { statusCode: 403, headers, body: JSON.stringify({ verified: false, error: 'Accès non autorisé' }) };
    }
    if (tx.tx_ref !== paymentRef) {
      return { statusCode: 200, headers, body: JSON.stringify({ verified: false, error: 'Référence transaction incorrecte' }) };
    }
    if (tx.status !== 'successful') {
      return { statusCode: 200, headers, body: JSON.stringify({ verified: false, error: `Statut transaction : ${tx.status}` }) };
    }

    // Vérification montant (tolérance 1 unité pour les arrondis de conversion)
    const expectedAmount = pending.devise === 'XOF'
      ? pending.amountXof + pending.cautionXof
      : pending.amountDevise + pending.cautionDevise;
    if (Math.abs(tx.amount - expectedAmount) > 1) {
      console.error(`Amount mismatch: expected ${expectedAmount}, got ${tx.amount}`);
      return { statusCode: 200, headers, body: JSON.stringify({ verified: false, error: 'Montant de la transaction incorrect' }) };
    }

    // 6. Idempotence — si déjà traité, retourner l'ID existant
    if (pending.status === 'completed' && pending.rentalId) {
      return { statusCode: 200, headers, body: JSON.stringify({ verified: true, rentalId: pending.rentalId }) };
    }

    // 7. Trouver le doc Firestore du power bank
    let pbDocId = pending.powerBankDocId || pending.powerBankId;
    let pbDocRef;

    const pbDirectSnap = await db.collection('powerBanks').doc(pbDocId).get();
    if (pbDirectSnap.exists) {
      pbDocRef = db.collection('powerBanks').doc(pbDocId);
    } else {
      // Fallback par champ qrCode
      const qSnap = await db.collection('powerBanks').where('qrCode', '==', pending.powerBankId).limit(1).get();
      if (qSnap.empty) return { statusCode: 200, headers, body: JSON.stringify({ verified: false, error: 'Power bank introuvable' }) };
      pbDocRef = qSnap.docs[0].ref;
      pbDocId  = qSnap.docs[0].id;
    }

    // 8. Transaction Firestore atomique
    const rentalRef = db.collection('rentals').doc();

    await db.runTransaction(async (t) => {
      const pbSnap = await t.get(pbDocRef);
      if (!pbSnap.exists || pbSnap.data().state !== 'disponible') {
        throw new Error('Power bank non disponible au moment de la confirmation');
      }

      // Créer la Rental
      t.set(rentalRef, {
        userId        : uid,
        qrCode        : pending.powerBankId,
        partnerId     : pending.partnerStartId || null,
        status        : 'en_cours',
        paymentMethod : 'flutterwave',
        paymentRef    : paymentRef,
        transactionId : transactionId,
        fraisXof      : pending.amountXof,
        cautionXof    : pending.cautionXof,
        devise        : pending.devise,
        fraisDevise   : pending.amountDevise  ?? pending.amountXof,
        cautionDevise : pending.cautionDevise ?? pending.cautionXof,
        startTime     : FieldValue.serverTimestamp(),
      });

      // Mettre à jour le power bank
      t.update(pbDocRef, {
        state        : 'en_location',
        currentUserId: uid,
        updatedAt    : FieldValue.serverTimestamp(),
      });

      // Marquer la pré-commande comme complétée
      t.update(db.collection('pendingRentalPayments').doc(paymentRef), {
        status   : 'completed',
        rentalId : rentalRef.id,
        completedAt: FieldValue.serverTimestamp(),
      });
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ verified: true, rentalId: rentalRef.id }),
    };

  } catch (err) {
    console.error('verifyFlutterwaveRentalPayment error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ verified: false, error: err.message || 'Erreur interne' }),
    };
  }
};