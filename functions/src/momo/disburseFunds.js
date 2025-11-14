const functions = require("firebase-functions");
const axios = require("axios");
const {getAccessToken} = require("../utils/auth");
const {logInfo, logError} = require("../utils/logger");

exports.disburseFunds = async (data, context) => {
  try {
    const {phone, amount, reference} = data;
    const token = await getAccessToken();

    const url = "https://sandbox.momodeveloper.mtn.com/disbursement/v1/deposit";
    const headers = {
      "X-Reference-Id": reference,
      "X-Target-Environment": "sandbox",
      "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY,
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const payload = {
      amount,
      currency: "EUR",
      externalId: reference,
      payee: {
        partyIdType: "MSISDN",
        partyId: phone,
      },
      payerMessage: "Retrait FriTok",
      payeeNote: "FriTok",
    };

    await axios.post(url, payload, {headers});

    logInfo("disburseFunds success", {reference, phone, amount});
    return {success: true, reference};
  } catch (err) {
    logError("disburseFunds failed", err);
    throw new functions.https.HttpsError("internal", "Échec du débours MoMo");
  }
};

