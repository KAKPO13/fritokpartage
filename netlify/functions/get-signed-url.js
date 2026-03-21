// netlify/functions/get-signed-url.js
const AWS = require("aws-sdk");

exports.handler = async function (event, context) {
  try {
    const body = JSON.parse(event.body);
    const { fileName, bucket } = body;

    if (!fileName || !bucket) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "fileName and bucket required" }),
      };
    }

    const s3 = new AWS.S3({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
      signatureVersion: "v4",
      region: "auto",
    });

    const contentType = bucket.includes("video") ? "video/mp4" : "image/jpeg";

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
        contentType, // renvoyé au client pour correspondance exacte
      }),
    };
  } catch (error) {
    console.error("ERROR SIGNED URL:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};