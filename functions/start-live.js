exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body);
    const { firebaseToken } = body;

    // Vérifier Firebase token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const uid = decodedToken.uid;

    // Générer channelName
    const channelName = "live_" + uuidv4();

    // Générer Agora token
    const role = RtcRole.PUBLISHER;
    const expireTime = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpireTime = currentTimestamp + expireTime;

    const agoraToken = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpireTime
    );

    // Enregistrer dans Supabase
    const { data, error } = await supabase
      .from("live_sessions")
      .insert([
        {
          channel_name: channelName,
          host_uid: uid,
          start_time: new Date().toISOString(),
          metadata: JSON.stringify({ status: "live" }), // ✅ JSON stringifié
        },
      ]);

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        channelName,
        token: agoraToken,
        supabaseRecord: data,
      }),
    };
  } catch (err) {
    const isAuthError = err.code === "auth/argument-error" || err.code === "auth/id-token-expired";
    return {
      statusCode: isAuthError ? 401 : 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
