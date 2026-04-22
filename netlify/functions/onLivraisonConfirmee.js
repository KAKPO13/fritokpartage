// functions/src/onLivraisonConfirmee.js
// Déclenchée quand commandes/{id}.statut passe à "livree"

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const FRAIS_PLATEFORME = 0.05; // FriTok prend 5 % au vendeur

exports.onLivraisonConfirmee = onDocumentUpdated(
  "commandes/{commandeId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Déclenche uniquement quand statut passe payee → livree
    if (before.statut !== "payee" || after.statut !== "livree") return;

    const db           = getFirestore();
    const { commandeId } = event.params;
    const devise       = after.devise || "XOF";
    const montantTotal = after.totalDevise || 0;

    // Calcul de la répartition
    const fraisPlateforme = Math.round(montantTotal * FRAIS_PLATEFORME * 100) / 100;
    const montantVendeur  = Math.round((montantTotal - fraisPlateforme) * 100) / 100;
    const vendeurId       = after.userIdVend || after.expediteurId;

    if (!vendeurId || montantVendeur <= 0) return;

    const escrowWalletRef  = db.collection("wallets").doc("escrow_fritok");
    const vendeurWalletRef = db.collection("wallets").doc(vendeurId);
    const fritsokWalletRef = db.collection("wallets").doc("fritok_revenus");
    const ledgerRef        = db.collection("escrow_ledger").doc();

    await db.runTransaction(async (tx) => {
      // Débite l'escrow
      tx.set(escrowWalletRef, {
        [devise]: FieldValue.increment(-montantTotal),
      }, { merge: true });

      // Crédite le vendeur
      tx.set(vendeurWalletRef, {
        [devise]: FieldValue.increment(montantVendeur),
      }, { merge: true });

      // Crédite FriTok (frais plateforme)
      tx.set(fritsokWalletRef, {
        [devise]: FieldValue.increment(fraisPlateforme),
      }, { merge: true });

      // Journal
      tx.set(ledgerRef, {
        type:            "liberation_escrow",
        commandeId,
        vendeurId,
        devise,
        montantTotal,
        montantVendeur,
        fraisPlateforme,
        createdAt:       FieldValue.serverTimestamp(),
      });

      // Marque la commande comme soldée
      tx.update(event.data.after.ref, {
        statut:          "soldee",
        releasedAt:      FieldValue.serverTimestamp(),
      });
    });

    console.log(`✅ Escrow libéré — vendeur ${vendeurId} reçoit ${montantVendeur} ${devise}`);
  }
);