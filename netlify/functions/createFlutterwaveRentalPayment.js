// netlify/functions/createFlutterwaveRentalPayment.js
// ─────────────────────────────────────────────────────────────────────────────
// Crée un lien Flutterwave pour payer une location de power bank.
// ➜ Enregistre une entrée TranstetMoney type "rental" en "pending"
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

function payRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand  = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PB-PAY-${rand}`;
}

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

    // 2. Profil utilisateur
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) return err(404, 'Utilisateur introuvable');
    const user = userSnap.data();

    // 3. Body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return err(400, 'Body JSON invalide'); }

    const {
      powerBankId, powerBankDocId, partnerStartId,
      amountXof, cautionXof,
      devise = 'XOF', amountDevise, cautionDevise,
    } = body;

    if (!powerBankId || !amountXof || !cautionXof) {
      return err(400, 'Paramètres manquants : powerBankId, amountXof, cautionXof');
    }

    // 4. Vérifier disponibilité côté serveur
    let pbDocRef, pbData;
    const directSnap = await db.collection('powerBanks').doc(powerBankDocId || powerBankId).get();
    if (directSnap.exists) {
      pbDocRef = directSnap.ref;
      pbData   = directSnap.data();
    } else {
      const qSnap = await db.collection('powerBanks').where('qrCode', '==', powerBankId).limit(1).get();
      if (qSnap.empty) return err(404, `Power bank "${powerBankId}" introuvable`);
      pbDocRef = qSnap.docs[0].ref;
      pbData   = qSnap.docs[0].data();
    }
    if (pbData.state !== 'disponible') {
      return err(409, `Power bank non disponible (état : ${pbData.state})`);
    }

    // 5. Récupérer le profil partenaire pour TranstetMoney
    let partnerNom = 'Partenaire Fritok';
    let partnerTel = '';
    if (partnerStartId) {
      const partSnap = await db.collection('users').doc(partnerStartId).get();
      if (partSnap.exists) {
        const p  = partSnap.data();
        partnerNom = p.nomBoutique || p.username || partnerNom;
        partnerTel = p.phone || '';
      }
    }

    // 6. Montants
    const totalXof    = Number(amountXof) + Number(cautionXof);
    const totalDevise = devise === 'XOF'
      ? totalXof
      : (Number(amountDevise) || Number(amountXof)) + (Number(cautionDevise) || Number(cautionXof));

    const ref     = payRef();
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://fritok.net';

    // 7. Lien Flutterwave
    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method : 'POST',
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tx_ref      : ref,
        amount      : totalDevise,
        currency    : devise,
        redirect_url: `${baseUrl}/app/payment-confirm?ref=${ref}&pb=${encodeURIComponent(powerBankId)}`,
        customer    : {
          email      : user.email || decoded.email || '',
          phonenumber: user.phone || '',
          name       : user.username || uid,
        },
        customizations: {
          title      : 'Location Power Bank Fritok',
          description: `Location ${powerBankId}`,
          logo       : `${baseUrl}/logo.png`,
        },
        meta: {
          userId: uid, powerBankId, powerBankDocId: pbDocRef.id,
          partnerStartId: partnerStartId || '', amountXof, cautionXof, devise, type: 'rental',
        },
      }),
    });

    const flwData = await flwRes.json();
    if (flwData.status !== 'success' || !flwData.data?.link) {
      return err(502, flwData.message || 'Erreur Flutterwave');
    }

    // 8. TranstetMoney — "rental" pending
    const txId = await createTranstetEntry(db, {
      type            : 'rental',
      currency        : devise,
      montantEnvoye   : totalDevise,
      frais           : 0,
      expediteurId    : uid,
      expediteurEmail : user.email || decoded.email || '',
      expediteurPhoto : user.photoUrl || '',
      destinataireId  : partnerStartId || 'fritok-system',
      destinataireNom : partnerNom,
      destinataireTel : partnerTel,
      status          : 'pending',
    });

    // 9. pendingRentalPayments
    await db.collection('pendingRentalPayments').doc(ref).set({
      userId        : uid,
      paymentRef    : ref,
      transtetId    : txId,
      powerBankId,
      powerBankDocId: pbDocRef.id,
      partnerStartId: partnerStartId || null,
      amountXof     : Number(amountXof),
      cautionXof    : Number(cautionXof),
      devise,
      amountDevise  : Number(amountDevise) || Number(amountXof),
      cautionDevise : Number(cautionDevise) || Number(cautionXof),
      status        : 'pending',
      createdAt     : admin.firestore.FieldValue.serverTimestamp(),
    });

    return ok({ payment_url: flwData.data.link, payment_ref: ref });

  } catch (e) {
    console.error('createFlutterwaveRentalPayment fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};