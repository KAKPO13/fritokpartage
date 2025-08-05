const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// 🔗 Génère des métadonnées Open Graph dynamiques
exports.generateOGMeta = functions.https.onRequest((req, res) => {
  const {
    title = "Fritok",
    image = "https://fritok.netlify.app/default-og.png",
    description = "Partagez vos moments avec style.",
  } = req.query;

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta property="og:title" content="${title}" />
        <meta property="og:image" content="${image}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="${req.protocol}://${req.get("host")}${req.originalUrl}" />
        <title>${title}</title>
      </head>
      <body>
        <h1>Prévisualisation générée pour ${title}</h1>
      </body>
    </html>
  `;

  res.status(200).send(html);
});

// 📦 Envoie une notification à la boutique (utilisateur) lors d'une commande
exports.sendCommandeNotification = functions.https.onCall(async (data, context) => {
  const {userId, title, commandeId} = data;

  try {
    const userDoc = await admin.firestore().collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new Error("Utilisateur introuvable");
    }

    const token = userDoc.data().fcmToken;

    if (!token) {
      throw new Error("Token FCM non disponible");
    }

    const message = {
      notification: {
        title: "📦 Nouvelle commande reçue",
        body: `Commande #${commandeId} pour ${title}`,
      },
      token,
    };

    await admin.messaging().send(message);
    return {success: true};
  } catch (error) {
    console.error("Erreur FCM :", error);
    return {success: false, error: error.message};
  }
});


