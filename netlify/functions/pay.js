const admin = require("firebase-admin")
const fetch = require("node-fetch")
const crypto = require("crypto")

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  })
}

const db = admin.firestore()

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405 }
  }

  try {
    const { userId, email, productId } = JSON.parse(event.body)

    if (!userId || !email || !productId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing required fields" }),
      }
    }

    // 🔎 Recherche produit via product.productId
    const snapshot = await db
      .collection("video_playlist")
      .where("product.productId", "==", productId)
      .limit(1)
      .get()

    if (snapshot.empty) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Product not found" }),
      }
    }

    const doc = snapshot.docs[0]
    const product = doc.data().product

    // 🔐 Génération tx_ref sécurisé
    const tx_ref = "FRITOK-" + crypto.randomUUID()

    // 💾 Sauvegarde pending payment AVANT appel Flutterwave
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      email,
      productId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // 💳 Création paiement Flutterwave
    const payment = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref,
        amount: product.price,
        currency: "XOF",
        redirect_url: "https://fritok.net/wallet",
        customer: {
          email,
        },
        customizations: {
          title: product.name,
          description: product.description,
        },
      }),
    })

    const paymentData = await payment.json()

    if (!paymentData?.data?.link) {
      throw new Error("Flutterwave error")
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        paymentLink: paymentData.data.link,
      }),
    }
  } catch (error) {
    console.error(error)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    }
  }
}