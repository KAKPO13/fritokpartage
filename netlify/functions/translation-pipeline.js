// netlify/functions/translation-pipeline.js
import { SpeechClient } from "@google-cloud/speech";
import { v2 as Translate } from "@google-cloud/translate";
import { db, auth } from "../../lib/firebaseClient";

const speechClient = new SpeechClient();
const translate = new Translate.Translate();

export const handler = async (event) => {
  const { channelId, audioBase64 } = JSON.parse(event.body);

  // 1. STT : audio mandarin → texte chinois
  const [sttResult] = await speechClient.recognize({
    audio: { content: audioBase64 },
    config: {
      encoding: "LINEAR16",
      sampleRateHertz: 16000,
      languageCode: "zh-CN",
      model: "latest_long",
    },
  });
  const zhText = sttResult.results
    .map((r) => r.alternatives[0].transcript)
    .join(" ");

  if (!zhText.trim()) {
    return { statusCode: 200, body: "{}" };
  }

  // 2. Traduction : chinois → français
  const [frText] = await translate.translate(zhText, {
    from: "zh-CN",
    to: "fr",
  });

  // 3. Push Firestore → déclenche le listener Flutter côté viewer
  await db.collection("live_subtitles").doc(channelId).set({
    zh: zhText,
    fr: frText,
    updatedAt: new Date(), // ou expose serverTimestamp() depuis firebaseClient
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ zh: zhText, fr: frText }),
  };
};

