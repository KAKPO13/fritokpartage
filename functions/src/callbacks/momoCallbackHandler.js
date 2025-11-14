const {logInfo, logError} = require("../utils/logger");

exports.momoCallbackHandler = async (req, res) => {
  try {
    const expectedToken = process.env.MOMO_CALLBACK_TOKEN;
    const receivedToken = req.headers["x-callback-token"];

    // 🔐 Vérification du token
    if (receivedToken !== expectedToken) {
      logError("Token invalide dans callback", {receivedToken});
      return res.status(403).send("Accès refusé");
    }

    const callbackData = req.body;

    // 🔍 Log complet du callback
    logInfo("MoMo callback reçu", callbackData);

    // 🧠 Exemple de traitement : enregistrer dans Firestore
    // const admin = require("firebase-admin");
    // await admin.firestore().collection("momo_callbacks").add({
    //   receivedAt: new Date(),
    //   data: callbackData
    // });

    // ✅ Réponse immédiate à MoMo
    return res.status(200).send("Callback reçu");
  } catch (err) {
    logError("Erreur dans momoCallbackHandler", err);
    return res.status(500).send("Erreur serveur");
  }
};
