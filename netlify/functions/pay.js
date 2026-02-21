import admin from "firebase-admin";
import fetch from "node-fetch";

/**
 * 🔥 Firebase Admin Init (Netlify safe)
 */
if (!admin.apps.length) {
  if (
    !process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    !process.env.FIREBASE_CLIENT_EMAIL ||
    !process.env.FIREBASE_PRIVATE_KEY
  ) {
    throw new Error("Firebase env variables manquantes");
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

/**
 * 💳 Payment options dynamiques
 */
function getPaymentOptions(currency) {
  switch (currency) {
    case "XOF":
      return "card,mobilemoneyfranco";
    case "NGN":
      return "card,ussd,banktransfer";
    case "GHS":
      return "card,mobilemoneyghana";
    case "USD":
      return "card";
    default:
      return "card";
  }
}

const allowedCurrencies = ["XOF", "NGN", "GHS", "USD"];

/**
 * 🔐 Timeout helper (anti API freeze)
 */
async function fetchWithTimeout(url, options, timeout = 8000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout API")), timeout)
    ),
  ]);
}

export const handler = async (event) => {
  try {
    /* ===============================
       🔐 AUTH
    =============================== */

    const authHeader = event.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    if (!decoded?.uid || !decoded?.email) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Utilisateur invalide" }),
      };
    }

    const userId = decoded.uid;

    /* ===============================
       📦 BODY SAFE PARSE
    =============================== */

    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Body manquant" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "JSON invalide" }),
      };
    }

    const { productId, currency } = body;

    if (
      !productId ||
      !currency ||
      !allowedCurrencies.includes(currency)
    ) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit ou devise invalide" }),
      };
    }

    /* ===============================
       🔎 PRODUIT
    =============================== */

    const snap = await db
      .collection("video_playlist")
      .where("product.productId", "==", productId)
      .limit(1)
      .get();

    if (snap.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Produit invalide" }),
      };
    }

    const product = snap.docs[0].data().product;

    if (!product?.price || product.price <= 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Prix invalide" }),
      };
    }

    /* ===============================
       🛡 Anti double paiement
    =============================== */

    const existingTx = await db
      .collection("wallet_transactions")
      .where("userId", "==", userId)
      .where("productId", "==", productId)
      .where("status", "==", "pending")
      .limit(1)
      .get();

    if (!existingTx.empty) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Paiement déjà en cours" }),
      };
    }

    /* ===============================
       💱 CONVERSION SERVEUR (BASE XOF)
    =============================== */

    let finalAmount = product.price;

    if (currency !== "XOF") {
      if (!process.env.NEXT_PUBLIC_EXCHANGE_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "API conversion non configurée" }),
        };
      }

      const rateRes = await fetchWithTimeout(
        `https://v6.exchangerate-api.com/v6/${process.env.NEXT_PUBLIC_EXCHANGE_API_KEY}/latest/XOF`
      );

      const rateData = await rateRes.json();
      const rate = rateData?.conversion_rates?.[currency];

      if (!rate) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Devise non supportée" }),
        };
      }

      finalAmount = Math.round(product.price * rate);
    }

    /* ===============================
       💾 CREATE TX
    =============================== */

    const txRef = await db.collection("wallet_transactions").add({
      userId,
      productId,
      basePriceXOF: product.price,
      amount: finalAmount,
      currency,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    /* ===============================
       🚀 FLUTTERWAVE CALL
    =============================== */

    const flutterRes = await fetchWithTimeout(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef.id,
          amount: finalAmount,
          currency,
          redirect_url: `${process.env.SITE_URL}/wallet`,
          payment_options: getPaymentOptions(currency),
          customer: {
            email: decoded.email,
          },
          customizations: {
            title: product.name,
          },
        }),
      }
    );

    const flutterData = await flutterRes.json();

    if (
      flutterData.status !== "success" ||
      !flutterData?.data?.link
    ) {
      await txRef.delete();

      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Erreur paiement Flutterwave" }),
      };
    }

    /* ===============================
       🔄 SAVE LINK
    =============================== */

    await txRef.update({
      paymentLink: flutterData.data.link,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        paymentLink: flutterData.data.link,
      }),
    };
  } catch (error) {
    console.error("PAY FUNCTION ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Erreur serveur interne" }),
    };
  }
};