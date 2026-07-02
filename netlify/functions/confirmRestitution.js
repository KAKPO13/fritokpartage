// netlify/functions/confirmRestitution.js
// ─────────────────────────────────────────────────────────────────────────────
// Confirme la restitution d'un power bank (paiement FLW ou Wallet) :
//   • Vérifie que partnerCode (QR scanné en boutique) correspond au
//     currentPartnerId attendu sur le power bank — mesure anti-fraude,
//     rejette avec 403 sinon.
//   • rental.status → "restitue" + endTime
//   • powerBank.state → "disponible"
//   • wallet.[devise] += cautionDevise  (dans la devise réelle de la location)
//   • escrow.totalCaution.[devise] -= cautionDevise
//   • TranstetMoney "restitution" → "completed"
//
// POST body : { rentalId: string, partnerCode: string }
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

// ── Constantes inline (cohérent avec createWalletRental.js) ─────────────────
const ESCROW_UID           = 'escrow_fritok';
const SUPPORTED_CURRENCIES = ['XOF', 'GHS', 'NGN'];

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

    const { rentalId, partnerCode } = body;
    if (!rentalId)    return err(400, 'rentalId requis');
    if (!partnerCode) return err(400, 'Scan du QR code partenaire requis pour confirmer la restitution.');

    // 3. Récupérer la Rental
    const rentalSnap = await db.collection('rentals').doc(rentalId).get();
    if (!rentalSnap.exists)           return err(404, 'Location introuvable');
    const rental = rentalSnap.data();
    if (rental.userId !== uid)        return err(403, 'Accès non autorisé');
    if (rental.status === 'restitue') return ok({ success: true, alreadyReturned: true });

    // 3bis. Devise réelle de la location — jamais supposer XOF par défaut
    //       silencieusement : si le rental n'a pas de devise enregistrée
    //       (anciennes locations pré-multi-devise), on retombe sur XOF en
    //       toute connaissance de cause, avec le bon montant XOF associé.
    const devise        = SUPPORTED_CURRENCIES.includes(rental.devise) ? rental.devise : 'XOF';
    const cautionDevise = Number(
      rental.cautionDevise ?? rental.cautionXof ?? 200
    );

    // 4. Trouver le doc powerBanks
    let pbDocRef;
    const qSnap = await db.collection('powerBanks').where('qrCode', '==', rental.qrCode).limit(1).get();
    if (!qSnap.empty) {
      pbDocRef = qSnap.docs[0].ref;
    } else {
      const byId = await db.collection('powerBanks').doc(rental.qrCode).get();
      if (byId.exists) pbDocRef = byId.ref;
    }
    if (!pbDocRef) return err(404, 'Power bank introuvable');

    const pbSnapPreCheck = await pbDocRef.get();
    const pbDataPreCheck = pbSnapPreCheck.exists ? pbSnapPreCheck.data() : {};
    const expectedPartnerId = pbDataPreCheck.currentPartnerId || null;

    // 4bis. ── Vérification anti-fraude : partenaire scanné == partenaire attendu ──
    //       Cette vérification est la SEULE source de vérité — jamais faire
    //       confiance à un éventuel flag "partnerVerified" envoyé par le
    //       client, qui pourrait être falsifié. On résout ici, côté serveur,
    //       l'identité du partenaire à partir du code scanné.
    if (!expectedPartnerId) {
      console.error('[confirmRestitution] powerBank sans currentPartnerId :', rental.qrCode);
      return err(500, 'Partenaire de rattachement introuvable pour ce power bank. Contacte le support.');
    }

    const partnerQSnap = await db.collection('partners')
      .where('qrCode', '==', partnerCode)
      .limit(1)
      .get();

    let scannedPartnerId = null;
    if (!partnerQSnap.empty) {
      const pDoc  = partnerQSnap.docs[0];
      const pData = pDoc.data();
      // Le "partnerId" logique peut être l'uid stocké sur le doc partenaire,
      // ou l'id du document lui-même selon comment il a été créé.
      scannedPartnerId = pData.uid || pDoc.id;
    } else {
      // Fallback : le code scanné est peut-être directement l'uid/id du partenaire.
      const directPartnerSnap = await db.collection('users').doc(partnerCode).get();
      if (directPartnerSnap.exists && directPartnerSnap.data().role === 'Vendeur') {
        scannedPartnerId = partnerCode;
      }
    }

    if (!scannedPartnerId) {
      return err(404, 'Code partenaire invalide ou introuvable.');
    }

    if (scannedPartnerId !== expectedPartnerId) {
      console.warn('[confirmRestitution] Tentative de restitution avec mauvais partenaire :', {
        uid, rentalId, expectedPartnerId, scannedPartnerId,
      });
      return err(403, "Ce n'est pas le bon partenaire. Rends le power bank chez le partenaire indiqué pour cette location.");
    }

    // 5. Récupérer profil utilisateur
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    // 6. Transaction Firestore atomique
    await db.runTransaction(async (t) => {
      const escrowRef = db.collection('users').doc(ESCROW_UID);
      const escrowSnap = await t.get(escrowRef);
      const escrowData = escrowSnap.exists ? escrowSnap.data() : {};
      const oldTotalCaution = typeof escrowData.totalCaution === 'object' ? escrowData.totalCaution : {};

      // Clôturer la Rental
      t.update(db.collection('rentals').doc(rentalId), {
        status : 'restitue',
        endTime: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Rembourser la caution sur le wallet, dans la devise réelle de la location
      t.update(db.collection('users').doc(uid), {
        [`wallet.${devise}`]: admin.firestore.FieldValue.increment(cautionDevise),
      });

      // Décrémenter l'escrow de la même devise/montant qui avait été bloqué
      // à la création de la location (cf. createWalletRental.js).
      const newTotalCaution = {
        XOF: Number(oldTotalCaution.XOF ?? 0),
        GHS: Number(oldTotalCaution.GHS ?? 0),
        NGN: Number(oldTotalCaution.NGN ?? 0),
        [devise]: Number(oldTotalCaution[devise] ?? 0) - cautionDevise,
      };
      t.set(escrowRef, {
        totalCaution: newTotalCaution,
        updatedAt   : admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

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
        currency        : devise,
        montantEnvoye   : cautionDevise,
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

    return ok({ success: true, cautionRefunded: cautionDevise, devise });

  } catch (e) {
    console.error('confirmRestitution fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};