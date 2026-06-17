// netlify/functions/createWalletRentalRecord.js
// ─────────────────────────────────────────────────────────────────────────────
// Enregistre la TranstetMoney après un paiement par Wallet Fritok.
// Appelé juste après que le client a créé la Rental en Firestore.
//
// POST body : { rentalId: string, powerBankId: string, partnerId?: string }
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
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const idToken    = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return err(401, 'Token manquant');

    let decoded;
    try { decoded = await auth.verifyIdToken(idToken); }
    catch (e) { return err(401, `Token invalide : ${e.message}`); }
    const uid = decoded.uid;

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body invalide'); }

    const { rentalId, powerBankId, partnerId } = body;
    if (!rentalId) return err(400, 'rentalId requis');

    // Récupérer la Rental pour avoir les montants exacts
    const rentalSnap = await db.collection('rentals').doc(rentalId).get();
    if (!rentalSnap.exists || rentalSnap.data().userId !== uid) {
      return err(404, 'Rental introuvable');
    }
    const rental = rentalSnap.data();

    // Profil utilisateur
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    // Profil partenaire
    let partnerNom = 'Partenaire Fritok';
    let partnerTel = '';
    const pId = partnerId || rental.partnerId;
    if (pId) {
      const pSnap = await db.collection('users').doc(pId).get();
      if (pSnap.exists) {
        partnerNom = pSnap.data().nomBoutique || pSnap.data().username || partnerNom;
        partnerTel = pSnap.data().phone || '';
      }
    }

    const total = (rental.fraisXof || 100) + (rental.cautionXof || 200);

    // TranstetMoney "rental" completed (wallet = immédiat)
    await createTranstetEntry(db, {
      type            : 'rental',
      currency        : rental.devise || 'XOF',
      montantEnvoye   : total,
      frais           : 0,
      expediteurId    : uid,
      expediteurEmail : user.email || decoded.email || '',
      expediteurPhoto : user.photoUrl || '',
      destinataireId  : pId || 'fritok-system',
      destinataireNom : partnerNom,
      destinataireTel : partnerTel,
      status          : 'completed',
    });

    // TranstetMoney "restitution" pending (remboursement futur de la caution)
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
      status          : 'pending',
    });

    return ok({ success: true });

  } catch (e) {
    console.error('createWalletRentalRecord fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};