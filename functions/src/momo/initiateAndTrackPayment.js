// ✅ correct
const functions = require("firebase-functions");
const {requestToPay} = require("./requestToPay");
const {getTransactionStatus} = require("./getTransactionStatus");
const {logInfo, logError} = require("../utils/logger");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

exports.initiateAndTrackPayment = async (data, context) => {
  try {
    const {phone, amount} = data;
    const reference = `FTK-${Date.now()}`; // ID unique

    // Étape 1 : Initier le paiement
    await requestToPay({phone, amount, reference}, context);
    logInfo("Paiement initié", {reference});

    // Étape 2 : Attendre 5 secondes
    await sleep(5000);

    // Étape 3 : Vérifier le statut
    const statusResult = await getTransactionStatus({referenceId: reference}, context);
    logInfo("Statut récupéré", {reference, status: statusResult.status});

    // Étape 4 : Retourner le statut consolidé
    return {
      success: true,
      reference,
      status: statusResult.status,
      reason: statusResult.reason || null,
    };
  } catch (err) {
    logError("initiateAndTrackPayment failed", err);
    throw new functions.https.HttpsError("internal", "Échec du suivi de paiement");
  }
};

