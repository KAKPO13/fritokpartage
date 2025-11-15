const admin = require("firebase-admin");
const { RtcTokenBuilder, RtcRole } = require("agora-access-token");
const { createClient } = require("@supabase/supabase-js");
const { v4: uuidv4 } = require("uuid");

// ✅ Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(require("./serviceAccountKey.json")), 
    // ou admin.credential.applicationDefault() si tu utilises GOOGLE_APPLICATION_CREDENTIALS
  });
}

// ✅ Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const APP_ID = process.env.AGORA_APP_ID;
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { firebaseToken } = body;

    if (!firebaseToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Firebase token manquant" }),
      };
    }

    // ✅ Vérifier Firebase token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const uid = decodedToken.uid;

    // ✅ Générer channelName unique
    const channelName = "live_" + uuidv4();

    // ✅ Générer Agora token
    const role = RtcRole.PUBLISHER;
    const expireTime = 3600; // 1h
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

    // ✅ Enregistrer dans Supabase
    const { data, error } = await supabase
      .from("live_sessions")
      .insert([
        {
          channel_name: channelName,
          host_uid: uid,
          start_time: new Date().toISOString(),
          metadata: { status: "live" }, // champ JSONB conseillé
        },
      ]);

    if (error) {
      console.error("Supabase error:", error);
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
    console.error("Backend error:", err);

    const isAuthError =
      err.code === "auth/argument-error" || err.code === "auth/id-token-expired";

    return {
      statusCode: isAuthError ? 401 : 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

