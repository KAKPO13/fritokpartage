const admin = require("firebase-admin")
const fetch = require("node-fetch")

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
    const { productId } = JSON.parse(event.body)

    if (!productId) {
      return { statusCode: 400, body: "Missing productId" }
    }

    // 🔐 Vérifier utilisateur via Firebase token
    const token = event.headers.authorization?.split("Bearer ")[1]
    if (!token) {
      return { statusCode: 401 }
    }

    const decoded = await admin.auth().verifyIdToken(token)
    const userId = decoded.uid
    const email = decoded.email

    // 🔎 Chercher produit via productId
    const snapshot = await db
      .collection("video_playlist")
      .where("product.productId", "==", productId)
      .limit(1)
      .get()

    if (snapshot.empty) {
      return { statusCode: 404 }
    }

    const product = snapshot.docs[0].data().product

    const tx_ref = "TX-" + Date.now()

    // 💾 Créer pending payment
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      amount: product.price,
      currency: "XOF",
      status: "pending",
      tx_ref,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // 💳 Flutterwave
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
        customer: { email },
        customizations: { title: product.name },
      }),
    })

    const paymentData = await payment.json()

    return {
      statusCode: 200,
      body: JSON.stringify({
        paymentLink: paymentData.data.link,
      }),
    }

  } catch (error) {
    console.error(error)
    return { statusCode: 500 }
  }
}