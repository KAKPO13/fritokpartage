// /app/api/flutterwave/route.js
import { NextResponse } from "next/server";
import admin from "firebase-admin";
import crypto from "crypto";

// Initialisation Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}
const db = admin.firestore();

// Helper pour créer tx_ref unique
const generateTxRef = () => `FRITOK-${crypto.randomUUID()}`;

// ------------------------ POST : Initier paiement ------------------------
export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, amount, currency, customerEmail, customerName } = body;

    if (!userId || !amount || !currency || !customerEmail) {
      return NextResponse.json(
        { error: "Paramètres manquants" },
        { status: 400 }
      );
    }

    const tx_ref = generateTxRef();

    // 1️⃣ Enregistrer paiement en attente
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      amount,
      currency,
      tx_ref,
      status: "PENDING",
      createdAt: admin.firestore.Timestamp.now(),
    });

    // 2️⃣ Appel Flutterwave Standard Checkout
    const flutterwaveResp = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tx_ref,
        amount,
        currency,
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/api/flutterwave/callback`,
        payment_options: "card,mobilemoney,ussd,banktransfer",
        customer: {
          email: customerEmail,
          name: customerName || "User FriTok",
          phonenumber: "+2250700000000",
        },
        customizations: {
          title: "FriTok Wallet",
          description: `Recharge de ${amount} ${currency}`,
          logo: "https://fritok.com/logo.png",
        },
      }),
    });

    const data = await flutterwaveResp.json();
    if (data.status !== "success") {
      console.error("[Flutterwave Init] ❌", data);
      return NextResponse.json({ error: "Erreur Flutterwave" }, { status: 500 });
    }

    return NextResponse.json({
      tx_ref,
      payment_url: data.data.link,
      amount,
      currency,
    });
  } catch (err) {
    console.error("[Flutterwave POST] ❌", err);
    return NextResponse.json({ error: "Erreur interne", message: err.message }, { status: 500 });
  }
}

// ------------------------ GET : Vérifier paiement ------------------------
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tx_ref = searchParams.get("tx_ref");

    if (!tx_ref) {
      return NextResponse.json({ error: "tx_ref manquant" }, { status: 400 });
    }

    console.log(`[Flutterwave GET] Vérification tx_ref=${tx_ref}`);

    const fwResp = await fetch(
      `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${tx_ref}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    const fwData = await fwResp.json();
    if (fwData.status !== "success") {
      return NextResponse.json({ status: "FAILED" }, { status: 500 });
    }

    const pendingRef = db.collection("pending_payments").doc(tx_ref);
    const pendingSnap = await pendingRef.get();

    if (!pendingSnap.exists) {
      return NextResponse.json({ error: "Paiement introuvable" }, { status: 404 });
    }

    const pendingData = pendingSnap.data();

    // Idempotence
    if (pendingData.status === "SUCCESS") {
      return NextResponse.json({ status: "already_processed" });
    }

    const fwStatus = fwData.data.status;
    if (fwStatus === "successful") {
      const { amount, currency, id: flutterwaveId } = fwData.data;

      await db.runTransaction(async (transaction) => {
        const userRef = db.collection("users").doc(pendingData.userId);

        // Crédit wallet
        transaction.update(userRef, {
          [`wallet.${currency}`]:
            admin.firestore.FieldValue.increment(Number(amount)),
        });

        // Historique transaction
        transaction.set(db.collection("wallet_transactions").doc(tx_ref), {
          userId: pendingData.userId,
          tx_ref,
          flutterwaveId,
          type: "topup",
          currency,
          amount: Number(amount),
          status: "SUCCESS",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(pendingRef, {
          status: "SUCCESS",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      console.log("[Flutterwave GET] Paiement validé et crédité");
      return NextResponse.json({
        status: "SUCCESS",
        amount: fwData.data.amount,
        currency: fwData.data.currency,
      });
    }

    // Paiement échoué
    await pendingRef.update({
      status: fwStatus || "FAILED",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ status: fwStatus || "FAILED" });
  } catch (err) {
    console.error("[Flutterwave GET] ❌ Erreur interne:", err);
    return NextResponse.json({ error: "Erreur interne", message: err.message }, { status: 500 });
  }
}
