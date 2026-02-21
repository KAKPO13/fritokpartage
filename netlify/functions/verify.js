import admin from "firebase-admin";
import fetch from "node-fetch";

const db = admin.firestore();

export const handler = async (event) => {
  try {
    const { transaction_id, tx_ref } = event.queryStringParameters;

    if (!transaction_id) {
      return { statusCode: 400, body: "Transaction manquante" };
    }

    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    const verifyData = await verifyRes.json();

    if (
      verifyData.status === "success" &&
      verifyData.data.status === "successful"
    ) {
      await db.collection("wallet_transactions").doc(tx_ref).update({
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ success: false }),
    };
  } catch (error) {
    console.error("VERIFY ERROR:", error);
    return { statusCode: 500, body: "Erreur serveur" };
  }
};