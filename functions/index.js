const functions = require("firebase-functions");

// 🔗 Génère des métadonnées Open Graph dynamiques
exports.generateOGMeta = functions.https.onRequest((req, res) => {
  const { title = "Fritok", image = "https://fritok.netlify.app/default-og.png", description = "Partagez vos moments avec style." } = req.query;

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

