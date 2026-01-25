const { RtcTokenBuilder, RtcRole } = require("agora-access-token");

exports.handler = async (event, context) => {
  const appId = process.env.AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing Agora credentials" }),
    };
  }

  try {
    const { channelName, uid, role = "PUBLISHER" } = JSON.parse(event.body);

    if (!channelName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Channel name is required" }),
      };
    }

    const parsedUid = Number.isInteger(uid) ? uid : 0;
    const agoraRole = role === "SUBSCRIBER" ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

    const expireTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expireTimeInSeconds;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      parsedUid,
      agoraRole,
      privilegeExpiredTs
    );

    return {
      statusCode: 200,
      body: JSON.stringify({ token }),
    };
  } catch (err) {
    console.error("Erreur génération token:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Token generation failed" }),
    };
  }
};
