// netlify/functions/verifyFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
// Vérifie côté serveur une transaction FLW et crée la Rental dans Firestore.
// ➜ Met à jour la TransfetMoney "rental" → "completed"
// ➜ Crée une TransfetMoney "restitution" en "pending" (remboursement caution)
// ─────────────────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { createTranstetEntry } = require('./_transtet');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId  : process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey : (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db   = admin.firestore();
const auth = admin.auth();

const HEADERS = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type'                : 'application/json',
};
function ok(body)       { return { statusCode: 200, headers: HEADERS, body: JSON.stringify(body) }; }
function err(code, msg) { return { statusCode: code, headers: HEADERS, body: JSON.stringify({ error: msg }) }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS };
  if (event.httpMethod !== 'POST')    return err(405, 'Method not allowed');

  try {
    // 1. Auth
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant');

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`); }
    const uid = decoded.uid;

    // 2. Body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body invalide'); }

    const { paymentRef, transactionId } = body;
    if (!paymentRef || !transactionId) {
      return err(400, 'paymentRef et transactionId requis');
    }

    // 3. Vérifier avec l'API Flutterwave (clé secrète — jamais côté client)
    const flwRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    });
    const flwData = await flwRes.json();

    if (flwData.status !== 'success') {
      return ok({ verified: false, error: flwData.message || 'Vérification FLW échouée' });
    }
    const tx = flwData.data;

    // 4. Récupérer la pré-commande
    const pendingSnap = await db.collection('pendingRentalPayments').doc(paymentRef).get();
    if (!pendingSnap.exists) {
      return ok({ verified: false, error: 'Référence de transaction introuvable' });
    }
    const pending = pendingSnap.data();

    // 5. Contrôles de sécurité
    if (pending.userId !== uid) {
      return err(403, 'Accès non autorisé');
    }
    if (tx.tx_ref !== paymentRef) {
      return ok({ verified: false, error: 'Référence transaction incorrecte' });
    }
    if (tx.status !== 'successful') {
      return ok({ verified: false, error: `Statut transaction FLW : ${tx.status}` });
    }

    // Vérification montant (tolérance 1 unité pour arrondis de conversion)
    const expectedAmount = pending.devise === 'XOF'
      ? pending.amountXof + pending.cautionXof
      : pending.amountDevise + pending.cautionDevise;

    if (Math.abs(tx.amount - expectedAmount) > 1) {
      console.error(`Amount mismatch: expected ${expectedAmount}, got ${tx.amount}`);
      return ok({ verified: false, error: 'Montant de la transaction incorrect' });
    }

    // 6. Idempotence — déjà traité ?
    if (pending.status === 'completed' && pending.rentalId) {
      return ok({ verified: true, rentalId: pending.rentalId });
    }

    // 7. Trouver le doc powerBanks
    let pbDocRef;
    const directSnap = await db.collection('powerBanks').doc(pending.powerBankDocId || pending.powerBankId).get();
    if (directSnap.exists) {
      pbDocRef = directSnap.ref;
    } else {
      const qSnap = await db.collection('powerBanks').where('qrCode', '==', pending.powerBankId).limit(1).get();
      if (qSnap.empty) return ok({ verified: false, error: 'Power bank introuvable' });
      pbDocRef = qSnap.docs[0].ref;
    }

    // 8. Récupérer le profil utilisateur pour TransfetMoney
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    // Profil partenaire
    let partnerNom = 'Partenaire Fritok';
    let partnerTel = '';
    if (pending.partnerStartId) {
      const pSnap = await db.collection('users').doc(pending.partnerStartId).get();
      if (pSnap.exists) {
        const p  = pSnap.data();
        partnerNom = p.nomBoutique || p.username || partnerNom;
        partnerTel = p.phone || '';
      }
    }

    // 9. Transaction Firestore atomique
    const rentalRef = db.collection('rentals').doc();

    await db.runTransaction(async (t) => {
      // Vérifier que le PB est toujours disponible
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
        paymentRef,
        transactionId,
        fraisXof      : pending.amountXof,
        cautionXof    : pending.cautionXof,
        devise        : pending.devise,
        fraisDevise   : pending.amountDevise  || pending.amountXof,
        cautionDevise : pending.cautionDevise || pending.cautionXof,
        startTime     : admin.firestore.FieldValue.serverTimestamp(),
      });

      // Mettre à jour le power bank
      t.update(pbDocRef, {
        state        : 'en_location',
        currentUserId: uid,
        updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
      });

      // Clôturer la pré-commande
      t.update(db.collection('pendingRentalPayments').doc(paymentRef), {
        status     : 'completed',
        rentalId   : rentalRef.id,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // 10. Mettre à jour TransfetMoney "rental" → "completed"
    if (pending.transtetId) {
      await db.collection('TransfetMoney').doc(pending.transtetId).update({
        status       : 'completed',
        transactionId: transactionId,  // ID FLW réel
      });
    }

    // 11. Créer TransfetMoney "restitution" en "pending"
    //     (sera mis à "completed" quand l'utilisateur rend le power bank)
    await createTranstetEntry(db, {
      type            : 'restitution',
      currency        : pending.devise,
      montantEnvoye   : pending.cautionDevise || pending.cautionXof,
      frais           : 0,
      // La restitution va de Fritok → utilisateur
      expediteurId    : 'fritok-system',
      expediteurEmail : 'noreply@fritok.net',
      expediteurPhoto : '',
      destinataireId  : uid,
      destinataireNom : user.username || user.email || uid,
      destinataireTel : user.phone || '',
      status          : 'pending', // mis à "completed" lors du retour physique
    });

    return ok({ verified: true, rentalId: rentalRef.id });

  } catch (e) {
    console.error('verifyFlutterwaveRentalPayment fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};