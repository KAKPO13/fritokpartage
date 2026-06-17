// netlify/functions/confirmRestitution.js
// ─────────────────────────────────────────────────────────────────────────────
// Confirme la restitution d'un power bank (paiement FLW ou Wallet) :
//   • rental.status → "restitue" + endTime
//   • powerBank.state → "disponible"
//   • wallet.XOF += cautionXof  (si paiement wallet)
//   • TranstetMoney "restitution" → "completed"
//
// POST body : { rentalId: string }
// Auth      : Bearer <Firebase ID Token>
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

    const { rentalId } = body;
    if (!rentalId) return err(400, 'rentalId requis');

    // 3. Récupérer la Rental
    const rentalSnap = await db.collection('rentals').doc(rentalId).get();
    if (!rentalSnap.exists)           return err(404, 'Location introuvable');
    const rental = rentalSnap.data();
    if (rental.userId !== uid)        return err(403, 'Accès non autorisé');
    if (rental.status === 'restitue') return ok({ success: true, alreadyReturned: true });

    // 4. Trouver le doc powerBanks
    let pbDocRef;
    const qSnap = await db.collection('powerBanks').where('qrCode', '==', rental.qrCode).limit(1).get();
    if (!qSnap.empty) {
      pbDocRef = qSnap.docs[0].ref;
    } else {
      const byId = await db.collection('powerBanks').doc(rental.qrCode).get();
      if (byId.exists) pbDocRef = byId.ref;
    }

    // 5. Récupérer profil utilisateur
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    // 6. Transaction Firestore atomique
    await db.runTransaction(async (t) => {
      // Clôturer la Rental
      t.update(db.collection('rentals').doc(rentalId), {
        status : 'restitue',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Rembourser la caution sur le wallet (quel que soit le mode de paiement)
      const caution = rental.cautionXof || 200;
      t.update(db.collection('users').doc(uid), {
        'wallet.XOF': admin.firestore.FieldValue.increment(caution),
      });

      // Libérer le power bank
      if (pbDocRef) {
        t.update(pbDocRef, {
          state        : 'disponible',
          currentUserId: '',
          updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    // 7. Chercher la TranstetMoney "restitution" pending liée à cette location
    //    (créée soit par verifyFlutterwaveRentalPayment, soit ci-dessous pour wallet)
    const existingRestitutionSnap = await db.collection('TranstetMoney')
      .where('type',            '==', 'restitution')
      .where('destinataireId',  '==', uid)
      .where('status',          '==', 'pending')
      .orderBy('timestamp',     'desc')
      .limit(1)
      .get();

    if (!existingRestitutionSnap.empty) {
      // Mettre à jour l'existante → "completed"
      await existingRestitutionSnap.docs[0].ref.update({ status: 'completed' });
    } else {
      // Créer une nouvelle entrée (cas paiement wallet — pas de pending préexistant)
      await createTranstetEntry(db, {
        type            : 'restitution',
        currency        : rental.devise || 'XOF',
        montantEnvoye   : rental.cautionXof || 200,
        frais           : 0,
        expediteurId    : 'fritok-system',
        expediteurEmail : 'noreply@fritok.net',
        expediteurPhoto : '',
        destinataireId  : uid,
        destinataireNom : user.username || user.email || uid,
        destinataireTel : user.phone || '',
        status          : 'completed',
      });
    }

    return ok({ success: true, cautionRefunded: rental.cautionXof || 200 });

  } catch (e) {
    console.error('confirmRestitution fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};