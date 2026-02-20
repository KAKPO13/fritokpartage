const admin = require("firebase-admin")
const crypto = require("crypto")
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
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET

    const signature = event.headers["verif-hash"]

    // 🔐 1️⃣ Vérification signature webhook
    if (!signature || signature !== secretHash) {
      return { statusCode: 401, body: "Invalid signature" }
    }

    const payload = JSON.parse(event.body)

    if (payload.event !== "charge.completed") {
      return { statusCode: 200 }
    }

    const { tx_ref, status, amount, currency, id } = payload.data

    if (status !== "successful") {
      return { statusCode: 200 }
    }

    // 🔍 2️⃣ Revalidation serveur Flutterwave
    const verifyRes = await fetch(
      `https://api.flutterwave.com/v3/transactions/${id}/verify`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    )

    const verifyData = await verifyRes.json()

    if (
      verifyData.status !== "success" ||
      verifyData.data.status !== "successful"
    ) {
      return { statusCode: 400 }
    }

    // 🔎 3️⃣ Vérifier transaction en base
    const pendingRef = db.collection("pending_payments").doc(tx_ref)
    const pendingSnap = await pendingRef.get()

    if (!pendingSnap.exists) {
      return { statusCode: 404 }
    }

    const pending = pendingSnap.data()

    // 🛡 Anti double paiement
    if (pending.status === "completed") {
      return { statusCode: 200 }
    }

    // 🛡 Vérifier montant & devise
    if (
      pending.amount !== amount ||
      pending.currency !== currency
    ) {
      return { statusCode: 400 }
    }

    // 🔁 Transaction atomique
    await db.runTransaction(async (transaction) => {
      const walletRef = db.collection("wallets").doc(pending.userId)
      const walletSnap = await transaction.get(walletRef)

      const currentBalance =
        walletSnap.exists && walletSnap.data()[currency]
          ? walletSnap.data()[currency]
          : 0

      // 💳 Crédit wallet multi-devise
      transaction.set(
        walletRef,
        {
          [currency]: currentBalance + amount,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      // 💾 Historique transaction
      const txHistoryRef = db.collection("wallet_transactions").doc()
      transaction.set(txHistoryRef, {
        userId: pending.userId,
        tx_ref,
        amount,
        currency,
        type: "credit",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // ✅ Update pending
      transaction.update(pendingRef, {
        status: "completed",
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
    })

    return { statusCode: 200 }
  } catch (error) {
    console.error(error)
    return { statusCode: 500 }
  }
}