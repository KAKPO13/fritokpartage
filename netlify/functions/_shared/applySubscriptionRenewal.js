// netlify/functions/_shared/applySubscriptionRenewal.js
//
// Transaction atomique de renouvellement d'abonnement. Appelée
// uniquement depuis du code serveur qui a déjà vérifié le paiement
// (le webhook Flutterwave) — ne revérifie rien elle-même.
//
// Écrit à 3 endroits, dans la MÊME transaction Firestore :
//   1. users/{uid}.subscription — même structure que create-seller-trial.js
//      (plan, status, currentPeriodStart/End, lastPaymentAt, etc.)
//   2. subscriptions/{uid} — miroir global déjà utilisé par
//      create-seller-trial.js pour le trial, tenu à jour ici aussi
//   3. users/escrow_fritok — INCRÉMENTE totalFrais.{devise} du montant
//      payé. C'est le document système unique (uid "escrow_fritok",
//      displayName "FriTok Escrow") qui agrège tous les frais perçus
//      par la plateforme (abonnements + location powerbank), PAS une
//      sous-collection par vendeur — corrigé après clarification.
//
// Idempotence : une transaction d'audit est écrite dans
// subscriptionPayments/{reference} (reference = tx_ref Flutterwave,
// donc naturellement unique par paiement). Si ce document existe déjà,
// la transaction s'arrête sans rien modifier d'autre — sert à la fois
// de garde-fou contre un double crédit ET d'historique consultable par
// le vendeur.
//
// Pose aussi le custom claim `subscriptionActive: true` sur le compte
// Firebase Auth, APRÈS le succès de la transaction, pour que le Worker
// Cloudflare (upload R2) le lise directement depuis le token vérifié.
//
// ⚠️ Limite connue : le claim ne se rafraîchit côté client qu'au
// renouvellement du token (~1h, ou immédiat via getIdToken(true)).
// C'est expireSubscriptions.js qui le repasse à false à l'expiration —
// un claim ne s'auto-expire jamais tout seul.

import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminAuth } from './firebaseAdmin.js';
import { convertToXOF } from './currency.js';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
const ESCROW_UID = 'escrow_fritok';

export async function applySubscriptionRenewal({
  userId, plan, currency, amount, moyenPaiement, reference,
}) {
  const userRef = adminDb.collection('users').doc(userId);
  const subRef = adminDb.collection('subscriptions').doc(userId);
  const escrowRef = adminDb.collection('users').doc(ESCROW_UID);
  const paymentRef = adminDb.collection('subscriptionPayments').doc(reference);

  const result = await adminDb.runTransaction(async (tx) => {
    // ── Idempotence ──────────────────────────────────────
    // Lu en premier, avant toute autre lecture, comme l'exige l'API
    // transactionnelle Firestore (tous les get() avant les write()).
    const paymentSnap = await tx.get(paymentRef);
    if (paymentSnap.exists) {
      return { alreadyProcessed: true };
    }

    const userSnap = await tx.get(userRef);
    const now = Timestamp.now();

    const currentSub = userSnap.exists ? userSnap.data()?.subscription : null;
    const currentEnd = currentSub?.currentPeriodEnd ?? null;

    // Prolonge depuis la fin de la période en cours si elle n'est pas
    // encore expirée (renouvellement anticipé = pas de jours perdus).
    const base = currentEnd && currentEnd.toMillis() > now.toMillis() ? currentEnd : now;
    const newEnd = Timestamp.fromMillis(base.toMillis() + PERIOD_MS);

    const subscription = {
      plan,
      status: 'active',
      trialEndsAt: currentSub?.trialEndsAt ?? null,
      currentPeriodStart: now,
      currentPeriodEnd: newEnd,
      flwPlanId: currentSub?.flwPlanId ?? '',
      lastPaymentAt: now,
      cancelledAt: null,
      createdAt: currentSub?.createdAt ?? now,
    };

    tx.set(userRef, {
      subscription,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    tx.set(subRef, {
      uid: userId,
      plan,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: newEnd,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // ── Doc d'audit / idempotence ─────────────────────────
    const montantXOF = convertToXOF(amount, currency);
    tx.set(paymentRef, {
      uid: userId,
      type: 'abonnement_renouvellement',
      plan,
      devise: currency,
      montant: amount,
      montantXOF,
      moyenPaiement: moyenPaiement ?? 'inconnu',
      reference,
      periodeAvant: currentSub
        ? { start: currentSub.currentPeriodStart ?? null, end: currentEnd }
        : null,
      periodeApres: { start: now, end: newEnd },
      createdAt: FieldValue.serverTimestamp(),
    });

    // ── Escrow global — INCRÉMENT, pas set() ─────────────
    // update() (et non set merge:true) est nécessaire ici : c'est la
    // seule méthode Firestore qui interprète 'totalFrais.XOF' comme un
    // chemin vers le champ imbriqué totalFrais.XOF plutôt que comme un
    // nom de champ littéral contenant un point.
    tx.update(escrowRef, {
      [`totalFrais.${currency}`]: FieldValue.increment(amount),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { newEnd, montantXOF, alreadyProcessed: false };
  });

  if (result.alreadyProcessed) {
    return result;
  }

  // ── Custom claim ─────────────────────────────────────────
  try {
    const userRecord = await adminAuth.getUser(userId);
    await adminAuth.setCustomUserClaims(userId, {
      ...(userRecord.customClaims || {}),
      subscriptionActive: true,
    });
  } catch (e) {
    // Ne fait pas échouer le renouvellement — Firestore (source de
    // vérité) est déjà correct. Le Worker refusera les uploads jusqu'à
    // ce que le claim soit posé : à surveiller si ce log apparaît.
    console.error('setCustomUserClaims failed for', userId, e);
  }

  return result;
}