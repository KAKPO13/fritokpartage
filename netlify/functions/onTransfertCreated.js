// functions/src/onTransfertCreated.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const DEVISES_VALIDES   = ["XOF", "NGN", "GHS", "USD"];
const ESCROW_UID        = "escrow_fritok";
const FRAIS_POURCENTAGE = 0.01; // 1 %

exports.onTransfertCreated = onDocumentCreated(
  "TransfertMoney/{docId}",
  async (event) => {
    const db  = getFirestore();
    const doc = event.data;
    if (!doc) return;

    const data    = doc.data();
    const docRef  = doc.ref;
    const docId   = event.params.docId;

    // ── ① Idempotence : déjà traité ? ─────────────────────
    if (data.status !== "pending") {
      console.log(`[${docId}] Ignoré — status: ${data.status}`);
      return;
    }

    // ── ② Verrouillage optimiste (évite les double-exécutions)
    const lockRef = db.collection("_locks").doc(docId);
    try {
      await db.runTransaction(async (tx) => {
        const lock = await tx.get(lockRef);
        if (lock.exists) throw new Error("ALREADY_PROCESSING");
        tx.set(lockRef, { createdAt: FieldValue.serverTimestamp() });
      });
    } catch (e) {
      if (e.message === "ALREADY_PROCESSING") {
        console.log(`[${docId}] Déjà en cours de traitement`);
        return;
      }
      throw e;
    }

    try {
      // ── ③ Validation des données ───────────────────────
      const {
        expediteurId,
        montantEnvoye,
        montantRecu,
        frais,
        devise,
        commandeId,
        type,
      } = data;

      // Champs obligatoires
      if (!expediteurId || !montantEnvoye || !devise || !commandeId) {
        await _echec(docRef, "CHAMPS_MANQUANTS", "Champs obligatoires absents");
        return;
      }

      // Type de transaction
      if (type !== "transfer") {
        await _echec(docRef, "TYPE_INVALIDE", `Type invalide: ${type}`);
        return;
      }

      // Devise valide
      if (!DEVISES_VALIDES.includes(devise)) {
        await _echec(docRef, "DEVISE_INVALIDE", `Devise invalide: ${devise}`);
        return;
      }

      // Montant cohérent
      const fraisAttendu   = Math.round(montantEnvoye * FRAIS_POURCENTAGE * 100) / 100;
      const recuAttendu    = Math.round((montantEnvoye - fraisAttendu) * 100) / 100;
      const toleranceCent  = 0.01; // tolérance arrondi float

      if (Math.abs(frais - fraisAttendu) > toleranceCent ||
          Math.abs(montantRecu - recuAttendu) > toleranceCent) {
        await _echec(docRef, "MONTANTS_INCOHERENTS",
          `frais=${frais} attendu=${fraisAttendu} | recu=${montantRecu} attendu=${recuAttendu}`);
        return;
      }

      // ── ④ Vérification Firebase Auth ──────────────────
      try {
        await getAuth().getUser(expediteurId);
      } catch {
        await _echec(docRef, "USER_INEXISTANT", `UID ${expediteurId} introuvable`);
        return;
      }

      // ── ⑤ Vérification de la commande ────────────────
      const commandeRef = db.collection("commandes").doc(commandeId);
      const commandeSnap = await commandeRef.get();

      if (!commandeSnap.exists) {
        await _echec(docRef, "COMMANDE_INTROUVABLE", commandeId);
        return;
      }

      const commande = commandeSnap.data();
      if (commande.statut === "payee") {
        await _echec(docRef, "COMMANDE_DEJA_PAYEE", commandeId);
        return;
      }
      if (commande.expediteurId !== expediteurId) {
        await _echec(docRef, "COMMANDE_MAUVAIS_USER",
          `commande.expediteurId=${commande.expediteurId} != expediteurId=${expediteurId}`);
        return;
      }

      // ── ⑥ Vérification du wallet débité ──────────────
      // On vérifie que le solde actuel est < solde_avant
      // (le débit Flutter a bien eu lieu)
      const walletRef  = db.collection("wallets").doc(expediteurId);
      const walletSnap = await walletRef.get();

      if (!walletSnap.exists) {
        await _echec(docRef, "WALLET_INTROUVABLE", expediteurId);
        return;
      }

      const walletData   = walletSnap.data();
      const soldeActuel  = walletData[devise] ?? 0;
      const soldeAvant   = data.soldeAvantDebit ?? null;

      // Si soldeAvantDebit a été stocké par le client, on vérifie
      if (soldeAvant !== null) {
        const soldeAttenduApresDebit = Math.round((soldeAvant - montantEnvoye) * 100) / 100;
        if (Math.abs(soldeActuel - soldeAttenduApresDebit) > toleranceCent) {
          await _echec(docRef, "WALLET_SOLDE_INCOHERENT",
            `soldeActuel=${soldeActuel} attendu=${soldeAttenduApresDebit}`);
          return;
        }
      }

      // ── ⑦ Transaction atomique : escrow + ledger + màj ─
      const escrowWalletRef = db.collection("wallets").doc(ESCROW_UID);
      const escrowLedgerRef = db.collection("escrow_ledger").doc();

      await db.runTransaction(async (tx) => {
        // Crédite l'escrow
        tx.set(escrowWalletRef, {
          [devise]: FieldValue.increment(montantRecu),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // Journal comptable escrow
        tx.set(escrowLedgerRef, {
          transactionId:  docId,
          commandeId,
          expediteurId,
          devise,
          montantEnvoye,
          montantRecu,
          frais,
          type:           "credit_escrow",
          createdAt:      FieldValue.serverTimestamp(),
        });

        // Marque le transfert comme réussi
        tx.update(docRef, {
          status:          "success",
          processedAt:     FieldValue.serverTimestamp(),
          transactionId:   docId,
        });

        // Met à jour la commande
        tx.update(commandeRef, {
          statut:          "payee",
          transactionId:   docId,
          paidAt:          FieldValue.serverTimestamp(),
        });
      });

      console.log(`✅ [${docId}] Escrow crédité ${montantRecu} ${devise}`);

      // ── ⑧ Notification vendeur (best-effort) ─────────
      await _notifierVendeur(db, commande, devise, montantRecu, docId);

    } catch (err) {
      console.error(`❌ [${docId}]`, err);
      await _echec(docRef, "ERREUR_INTERNE", err.message);
    } finally {
      // Libère le verrou
      await lockRef.delete().catch(() => {});
    }
  }
);

// ── Helpers ──────────────────────────────────────────────────

async function _echec(docRef, code, detail) {
  console.error(`❌ ECHEC [${code}]: ${detail}`);
  await docRef.update({
    status:    "failed",
    errorCode: code,
    errorDetail: detail,
    failedAt:  FieldValue.serverTimestamp(),
  }).catch(() => {});
}

async function _notifierVendeur(db, commande, devise, montant, transactionId) {
  try {
    const vendeurId = commande.userIdVend || commande.expediteurId;
    if (!vendeurId) return;
    await db.collection("notifications").add({
      userId:    vendeurId,
      type:      "paiement_recu",
      title:     "Paiement reçu 💰",
      body:      `Commande payée : ${montant} ${devise} (en attente de livraison)`,
      transactionId,
      commandeId: commande.commandeId || "",
      isRead:    false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn("⚠️ Notification vendeur échouée:", e.message);
  }
}