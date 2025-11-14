const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

// Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

// Supabase client
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

exports.handler = async (event, context) => {
  try {
    const body = JSON.parse(event.body);
    const { firebaseToken, channelName, storageLink } = body;

    // 1️⃣ Vérifier Firebase token
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const uid = decodedToken.uid;

    // 2️⃣ Mettre à jour la session dans Supabase
    const { data, error } = await supabase
      .from("live_sessions")
      .update({
        end_time: new Date().toISOString(),
        storage_link: storageLink || null,
        metadata: { status: "ended" },
      })
      .eq("channel_name", channelName)
      .eq("host_uid", uid);

    if (error) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: error.message }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Live terminé", updated: data }),
    };
  } catch (err) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
