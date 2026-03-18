const AWS = require("aws-sdk");

exports.handler = async function(event, context) {
  try {
    // Parse body JSON
    const body = JSON.parse(event.body);
    const { fileName, bucket } = body;

    if (!fileName || !bucket) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "fileName and bucket required" }),
      };
    }

    // Config R2
    const s3 = new AWS.S3({
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      accessKeyId: process.env.R2_ACCESS_KEY,
      secretAccessKey: process.env.R2_SECRET_KEY,
      signatureVersion: "v4",
    });

    // Générer URL signée
    const signedUrl = s3.getSignedUrl("putObject", {
      Bucket: bucket,
      Key: fileName,
      Expires: 60,
      ContentType: bucket.includes("video") ? "video/mp4" : "image/jpeg",
    });


    return {
      statusCode: 200,
      body: JSON.stringify({ url: signedUrl }),
    };

  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};