const AWS = require("aws-sdk");

exports.handler = async function (event) {
  try {
    const body = JSON.parse(event.body);
    const { fileName, bucket, contentType } = body;

    if (!fileName || !bucket || !contentType) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "fileName, bucket et contentType requis" }),
      };
    }

    const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
    if (!allowedTypes.includes(contentType)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Type non autorisé" }),
      };
    }

    const safeFileName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const s3 = new AWS.S3({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
      signatureVersion: "v4",
      region: "auto",
    });

    const signedUrl = s3.getSignedUrl("putObject", {
      Bucket: bucket,
      Key: `uploads/${safeFileName}`,
      Expires: 300,
      ContentType: contentType,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        url: signedUrl,
        key: `uploads/${safeFileName}`,
      }),
    };

  } catch (error) {
    console.error("ERROR SIGNED URL:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur" }),
    };
  }
};