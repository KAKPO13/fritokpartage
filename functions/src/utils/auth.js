const axios = require("axios");

async function getAccessToken() {
  try {
    const url = "https://sandbox.momodeveloper.mtn.com/collection/token/";
    const headers = {
      "Ocp-Apim-Subscription-Key": process.env.MOMO_SUBSCRIPTION_KEY,
      "Authorization": `Basic ${Buffer.from(
          `${process.env.MOMO_API_USER}:${process.env.MOMO_API_KEY}`,
      ).toString("base64")}`,
    };

    const response = await axios.post(url, null, {headers});
    return response.data.access_token;
  } catch (err) {
    console.error("Erreur MoMo Auth:", err.response?.data || err.message);
    throw new Error("Échec de l'obtention du token MoMo");
  }
}

module.exports = {getAccessToken};

