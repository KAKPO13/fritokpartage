const functions = require("firebase-functions");
const axios = require("axios");
const {getAccessToken} = require("../utils/auth");
const {logInfo, logError} = require("../utils/logger");

exports.getTransactionStatus = async (data, context) => {
  try {
    const {referenceId} = data;
    if (!referenceId) {
      throw new functions.https.HttpsError(
          "invalid-argument",
          "Référence manquante",
      );
    }

    const token = await getAccessToken();

    const url = `https://sandbox.momodeveloper.mtn.com/collection/v1/requesttopay/${referenceId}`;
    const headers = {
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY,
      "Authorization": `Bearer ${token}`,
    };

    const res = await axios.get(url, {headers});
    logInfo("getTransactionStatus success", {
      referenceId,
      status: res.data.status,
    });

    return {
      success: true,
      status: res.data.status,
      reason: res.data.reason || null,
      payer: res.data.payer,
      amount: res.data.amount,
      currency: res.data.currency,
    };
  } catch (err) {
    logError("getTransactionStatus failed", err);
    throw new functions.https.HttpsError(
        "internal",
        "Impossible de récupérer le statut du paiement",
    );
  }
};
