// netlify/functions/translate-text.js
import { v2 as Translate } from "@google-cloud/translate";

const translate = new Translate();

export const handler = async (event) => {
  const { text, from, to } = JSON.parse(event.body);
  const [translated] = await translate.translate(text, { from, to });
  return {
    statusCode: 200,
    body: JSON.stringify({ translated }),
  };
};
