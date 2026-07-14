// netlify/functions/_shared/finalizeRentalPayment.js
// -----------------------------------------------------------------------------
// Logique atomique de finalisation d'une location power bank, extraite de
// verifyFlutterwaveRentalPayment.js pour etre partagee entre :
//   - le verify declenche par le frontend (chemin principal)
//   - le webhook (filet de securite)
// Evite de dupliquer ~80 lignes de transaction Firestore a deux endroits
// qui risqueraient de diverger avec le temps.
//
// Le paramètre `provider` ('kkiapay' | 'flutterwave') est juste stocke sur
// le document rental pour tracabilite/support client.
// -----------------------------------------------------------------------------

import constants from '../_constants.cjs';
const { ESCROW_UID } = constants;

export async function finalizeRentalPayment({ db, admin, pending, paymentRef, transactionId, provider }) {
  // 1. Trouver le document powerBanks
  let pbDocRef;
  const directSnap = await db.collection('powerBanks')
    .doc(pending.powerBankDocId || pending.powerBankId)
    .get();
  if (directSnap.exists) {
    pbDocRef = directSnap.ref;
  } else {
    const qSnap = await db.collection('powerBanks')
      .where('qrCode', '==', pending.powerBankId)
      .limit(1)
      .get();
    if (qSnap.empty) throw Object.assign(new Error('Power bank introuvable'), { code: 404 });
    pbDocRef = qSnap.docs[0].ref;
  }

  // 2. Profils utilisateur + partenaire
  const userSnap = await db.collection('users').doc(pending.userId).get();
  const user = userSnap.exists ? userSnap.data() : {};

  let partnerNom = 'Partenaire Fritok';
  let partnerTel = '';
  if (pending.partnerStartId) {
    const pSnap = await db.collection('users').doc(pending.partnerStartId).get();
    if (pSnap.exists) {
      partnerNom = pSnap.data().nomBoutique || pSnap.data().username || partnerNom;
      partnerTel = pSnap.data().phone || '';
    }
  }

  // 3. Transaction Firestore atomique
  const rentalRef = db.collection('rentals').doc();

  await db.runTransaction(async (t) => {
    const pbSnap = await t.get(pbDocRef);
    if (!pbSnap.exists) {
      throw Object.assign(new Error('Power bank introuvable dans la transaction'), { code: 404 });
    }

    const pbState = pbSnap.data().state;
    if (!['disponible', 'en_attente_paiement'].includes(pbState)) {
      throw Object.assign(new Error(`Power bank non disponible (etat : ${pbState})`), { code: 409 });
    }
    if (pbState === 'en_attente_paiement' && pbSnap.data().lockedBy !== pending.userId) {
      throw Object.assign(new Error('Power bank verrouille par un autre utilisateur'), { code: 409 });
    }

    t.set(rentalRef, {
      userId: pending.userId,
      qrCode: pending.powerBankId,
      partnerId: pending.partnerStartId || null,
      status: 'en_cours',
      paymentMethod: provider,
      paymentRef,
      transactionId,
      fraisXof: pending.amountXof,
      cautionXof: pending.cautionXof,
      devise: pending.devise,
      fraisDevise: pending.fraisDevise || pending.amountXof,
      cautionDevise: pending.cautionDevise || pending.cautionXof,
      startTime: admin.firestore.FieldValue.serverTimestamp(),
    });

    t.update(pbDocRef, {
      state: 'en_location',
      currentUserId: pending.userId,
      lockedBy: null,
      lockedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    t.update(db.collection('pendingRentalPayments').doc(paymentRef), {
      status: 'completed',
      rentalId: rentalRef.id,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // 4. TransfetMoney "rental" -> completed
  if (pending.transtetId) {
    await db.collection('TransfetMoney').doc(pending.transtetId).update({
      status: 'completed',
      transactionId,
    }).catch(e => console.error('[finalizeRentalPayment] Mise a jour TransfetMoney rental echouee (non bloquant):', e.message));
  }

  // 5. TransfetMoney "restitution" pending
  await createTranstetEntry(db, {
    type: 'restitution',
    currency: pending.devise,
    montantEnvoye: pending.cautionDevise || pending.cautionXof,
    frais: 0,
    expediteurId: ESCROW_UID,
    expediteurEmail: 'escrow@fritok.net',
    expediteurPhoto: '',
    destinataireId: pending.userId,
    destinataireNom: user.username || user.email || pending.userId,
    destinataireTel: user.phone || '',
    status: 'pending',
  }).catch(e => console.error('[finalizeRentalPayment] Ecriture TransfetMoney restitution echouee (non bloquant):', e.message));

  return { rentalId: rentalRef.id };
}