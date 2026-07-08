// netlify/functions/confirmRestitution.js
// ─────────────────────────────────────────────────────────────────────────────
// Confirme la restitution d'un power bank (paiement FLW ou Wallet) :
//   • Vérifie que partnerCode (code à 6 chiffres généré par le partenaire
//     via generateRestitutionCode.js) existe, n'est pas expiré, n'a pas
//     déjà été utilisé, et correspond au partenaire chez qui la location a
//     réellement été effectuée (rental.partnerId, figé à la création de la
//     location — voir createWalletRental.js) — mesure anti-fraude. Le code
//     est marqué "used" de façon ATOMIQUE dans la même transaction que le
//     remboursement, ce qui empêche toute réutilisation même en cas de
//     requêtes concurrentes.
//   • rental.status → "restitue" + endTime
//   • powerBank.state → "disponible"
//   • wallet.[devise] += cautionDevise  (dans la devise réelle de la location)
//   • escrow.totalCaution.[devise] -= cautionDevise
//   • TranstetMoney "restitution" → "completed"
//
// POST body : { rentalId: string, partnerCode: string }  (code à 6 chiffres)
// Auth      : Bearer <Firebase ID Token>
// ─────────────────────────────────────────────────────────────────────────────

const admin  = require('firebase-admin');
const crypto = require('crypto');
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

// Même secret que generateRestitutionCode.js — nécessaire pour recalculer
// et vérifier la signature du code au moment de la restitution.
const SIGNING_SECRET = process.env.RESTITUTION_CODE_SECRET;

function signCode({ partnerId, code, createdAtMs }) {
  return crypto
    .createHmac('sha256', SIGNING_SECRET)
    .update(`${partnerId}:${code}:${createdAtMs}`)
    .digest('hex');
}

// Comparaison en temps constant pour éviter les attaques par timing sur la
// vérification de signature.
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
    if (!partnerCode) return err(400, 'Code de restitution requis pour confirmer.');

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

    // 4bis. Partenaire attendu pour cette restitution ────────────────────
    //       On utilise en priorité rental.partnerId, qui est figé au
    //       moment exact de la création de la location (cf.
    //       createWalletRental.js : `partnerId: pbData.currentPartnerId`)
    //       et représente donc fidèlement "chez quel partenaire ce power
    //       bank a été loué". C'est la bonne source de vérité — contrairement
    //       à powerBanks.currentPartnerId, qui est un champ mutable pouvant
    //       en théorie changer entre la location et la restitution (ex. si
    //       un admin réaffecte le power bank à un autre point de dépôt).
    //       On ne retombe sur currentPartnerId qu'en dernier recours, pour
    //       les locations anciennes créées avant l'ajout de ce champ.
    let expectedPartnerId = rental.partnerId || null;
    if (!expectedPartnerId) {
      const pbSnapPreCheck = await pbDocRef.get();
      expectedPartnerId = pbSnapPreCheck.exists ? (pbSnapPreCheck.data().currentPartnerId || null) : null;
      if (expectedPartnerId) {
        console.warn('[confirmRestitution] rental.partnerId absent, fallback sur powerBanks.currentPartnerId :', { rentalId });
      }
    }

    if (!expectedPartnerId) {
      console.error('[confirmRestitution] Aucun partenaire de rattachement trouvable pour cette location :', rentalId);
      return err(500, 'Partenaire de rattachement introuvable pour ce power bank. Contacte le support.');
    }

    // 5. Récupérer profil utilisateur
    const userSnap = await db.collection('users').doc(uid).get();
    const user     = userSnap.exists ? userSnap.data() : {};

    // 6. Transaction Firestore atomique
    //    ── Vérification anti-fraude du code de restitution ────────────────
    //    Le code (généré par le partenaire, cf. generateRestitutionCode.js)
    //    est lu, validé (existe / pas expiré / pas déjà utilisé / bon
    //    partenaire) et marqué "used" dans CETTE MÊME transaction. C'est ce
    //    qui garantit qu'un code ne peut jamais servir deux fois, même en
    //    cas de deux requêtes de restitution simultanées avec le même code.
    //    Un simple check-avant-écriture non transactionnel serait
    //    vulnérable à une "course" entre deux requêtes concurrentes.
    const codeRef = db.collection('restitutionCodes').doc(partnerCode);

    await db.runTransaction(async (t) => {
      const codeSnap = await t.get(codeRef);
      if (!codeSnap.exists) {
        throw Object.assign(new Error('Code invalide. Demande au commerçant de générer un nouveau code.'), { code: 404 });
      }
      const codeData = codeSnap.data();

      if (codeData.used === true) {
        throw Object.assign(new Error('Ce code a déjà été utilisé. Demande un nouveau code au commerçant.'), { code: 410 });
      }

      const expiresAtMs = codeData.expiresAt?.toMillis ? codeData.expiresAt.toMillis() : 0;
      if (expiresAtMs < Date.now()) {
        throw Object.assign(new Error('Ce code a expiré. Demande un nouveau code au commerçant.'), { code: 410 });
      }

      const scannedPartnerId = codeData.partnerId || null;
      if (!scannedPartnerId) {
        throw Object.assign(new Error('Code de restitution invalide (partenaire manquant).'), { code: 500 });
      }

      // ── Vérification de signature ────────────────────────────────────
      // Recalcule la signature attendue à partir des données lues et la
      // compare à celle stockée. Toute incohérence indique que ce document
      // n'a pas été créé par generateRestitutionCode.js (falsification,
      // écriture directe non autorisée, bug de migration, etc.) — dans ce
      // cas on rejette plutôt que de faire confiance au champ partnerId.
      if (!SIGNING_SECRET) {
        console.error('[confirmRestitution] RESTITUTION_CODE_SECRET manquant dans les variables d\'environnement');
        throw Object.assign(new Error('Configuration serveur incomplète. Contacte le support.'), { code: 500 });
      }
      const expectedSignature = signCode({
        partnerId  : scannedPartnerId,
        code       : partnerCode,
        createdAtMs: codeData.createdAtMs,
      });
      if (!safeEqual(expectedSignature, codeData.signature)) {
        console.error('[confirmRestitution] Signature invalide sur restitutionCodes/%s — document potentiellement falsifié.', partnerCode, {
          uid, rentalId, scannedPartnerId,
        });
        throw Object.assign(new Error('Code de restitution invalide. Contacte le support.'), { code: 403 });
      }

      if (scannedPartnerId !== expectedPartnerId) {
        console.warn('[confirmRestitution] Tentative de restitution avec mauvais partenaire :', {
          uid, rentalId, expectedPartnerId, scannedPartnerId,
        });
        throw Object.assign(new Error("Ce n'est pas le bon partenaire. Rends le power bank chez le partenaire indiqué pour cette location."), { code: 403 });
      }

      // ── À partir d'ici, le code est valide : on consomme le code et on
      //    effectue le remboursement dans la même transaction atomique. ──
      const escrowRef  = db.collection('users').doc(ESCROW_UID);
      const escrowSnap = await t.get(escrowRef);
      const escrowData = escrowSnap.exists ? escrowSnap.data() : {};
      const oldTotalCaution = typeof escrowData.totalCaution === 'object' ? escrowData.totalCaution : {};

      // Marquer le code comme utilisé — usage unique garanti.
      t.update(codeRef, {
        used         : true,
        usedAt       : admin.firestore.FieldValue.serverTimestamp(),
        usedByUid    : uid,
        usedByRental : rentalId,
      });

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
      t.update(pbDocRef, {
        state        : 'disponible',
        currentUserId: '',
        updatedAt    : admin.firestore.FieldValue.serverTimestamp(),
      });
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
    if (e.code === 404) return err(404, e.message);
    if (e.code === 410) return err(410, e.message);
    if (e.code === 403) return err(403, e.message);
    console.error('confirmRestitution fatal:', e);
    return err(500, e.message || 'Erreur interne');
  }
};