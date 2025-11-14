const requestToPay = require('./momo/requestToPay');
const axios = require("axios");
const {getAccessToken} = require("../utils/auth");
const {logInfo, logError} = require("../utils/logger");

module.exports = async (req, res) => {
  try {
    const {phone, amount, reference} = req.body;
    const token = await getAccessToken();

    const url = "https://sandbox.momodeveloper.mtn.com/collection/v1/requesttopay";
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
      payer: {partyIdType: "MSISDN", partyId: phone},
      payerMessage: "Recharge FriTok",
      payeeNote: "FriTok",
    };

    await axios.post(url, payload, {headers});

    logInfo("requestToPay success", {reference, phone, amount});
    res.status(200).json({success: true, reference});
  } catch (err) {
    logError("requestToPay failed", err);
    res.status(500).json({success: false, message: "Échec du paiement MoMo"});
  }
};
