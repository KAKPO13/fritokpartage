const AWS = require("aws-sdk");

exports.handler = async function(event, context) {
  try {
    const body = JSON.parse(event.body);
    const { fileName, bucket, contentType } = body;

    if (!fileName || !bucket || !contentType) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "fileName, bucket et contentType requis"
        }),
      };
    }

    // Config Cloudflare R2
    const s3 = new AWS.S3({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
      signatureVersion: "v4",
      region: "auto", // ✅ obligatoire pour R2
    });

    // Générer URL signée PUT
    const signedUrl = s3.getSignedUrl("putObject", {
      Bucket: bucket,
      Key: fileName,
      Expires: 300, // 5 minutes
      ContentType: contentType,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: signedUrl,
        contentType: contentType,
      }),
    };

  } catch (error) {
    console.error("ERROR SIGNED URL:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur interne serveur" }),
    };
  }
};