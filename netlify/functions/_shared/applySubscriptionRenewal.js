// netlify/functions/_shared/applySubscriptionRenewal.js
// Transaction atomique : prolonge sellers/{uid} et journalise les frais
// dans users/{uid}/escrow_fritok. Appelée uniquement depuis du code
// serveur qui a déjà vérifié le paiement (le webhook Flutterwave) —
// cette fonction elle-même ne revérifie rien, elle fait confiance à
// son appelant.
//
// Pose aussi le custom claim `subscriptionActive: true` sur le compte
// Firebase Auth du vendeur, pour que le Worker Cloudflare (upload R2)
// puisse vérifier l'abonnement directement depuis le token déjà signé,
// sans appel Firestore supplémentaire à chaque upload.
//
// ⚠️ Limite connue : les custom claims ne sont relus par le SDK client
// qu'au rafraîchissement du token (automatique toutes les ~1h, ou
// immédiat si le client appelle getIdToken(true) après paiement). Un
// claim ne s'auto-expire jamais — c'est le rôle de la fonction
// planifiée expireSubscriptions.js de le repasser à false quand
// currentPeriodEnd est dépassé.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth } from "./firebaseAdmin.js";
import { convertToXOF, getRateToXOF } from "./currency.js";

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export async function applySubscriptionRenewal(db, {
  userId, plan, currency, amount, moyenPaiement, reference,
}) {
  const sellerRef = db.collection("sellers").doc(userId);
  const escrowRef = db.collection("users").doc(userId)
                       .collection("escrow_fritok").doc();

  const result = await db.runTransaction(async (tx) => {
    const sellerSnap = await tx.get(sellerRef);
    const now = Timestamp.now();

    // Prolonge depuis la fin de la période en cours si elle n'est pas
    // encore expirée (renouvellement anticipé = pas de jours perdus).
    const currentEnd = sellerSnap.exists ? sellerSnap.data()?.currentPeriodEnd : null;
    const base = currentEnd && currentEnd.toMillis() > now.toMillis() ? currentEnd : now;
    const newEnd = Timestamp.fromMillis(base.toMillis() + PERIOD_MS);

    tx.set(sellerRef, {
      plan,
      subscriptionActive: true,
      currentPeriodStart: now,
      currentPeriodEnd: newEnd,
      currency,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const montantXOF = convertToXOF(amount, currency);

    tx.set(escrowRef, {
      type: "abonnement_renouvellement",
      plan,
      createdAt: FieldValue.serverTimestamp(),
      fraisAbonnement: {
        devise: currency,
        montant: amount,
        montantXOF,
        tauxChange: currency !== "XOF" ? { [`${currency}_XOF`]: getRateToXOF(currency) } : null,
      },
      periodeAvant: sellerSnap.exists
        ? { start: sellerSnap.data()?.currentPeriodStart ?? null, end: currentEnd ?? null }
        : null,
      periodeApres: { start: now, end: newEnd },
      moyenPaiement: moyenPaiement ?? "inconnu",
      reference,
    });

    return { newEnd, montantXOF };
  });

  // ── Custom claim ─────────────────────────────────────────
  // Posé APRÈS le succès de la transaction Firestore, pas avant : on
  // ne veut jamais un claim "actif" sans écriture correspondante.
  // On préserve les autres claims existants sur le compte plutôt que
  // de les écraser.
  try {
    const userRecord = await adminAuth.getUser(userId);
    await adminAuth.setCustomUserClaims(userId, {
      ...(userRecord.customClaims || {}),
      subscriptionActive: true,
    });
  } catch (e) {
    // Ne fait pas échouer le renouvellement si la pose du claim rate —
    // le Worker retombera sur "abonnement inactif" au prochain upload
    // jusqu'à ce que le claim soit posé (à surveiller/relancer). La
    // source de vérité (Firestore) est déjà correcte à ce stade.
    console.error("setCustomUserClaims failed for", userId, e);
  }

  return result;
}