import { NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req) {

  const signature = req.headers.get("verif-hash");

  if (signature !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const payload = await req.json();

  if (payload.event !== "charge.completed") {
    return NextResponse.json({ received: true });
  }

  const data = payload.data;

  if (data.status !== "successful") {
    return NextResponse.json({ received: true });
  }

  const txRef = data.tx_ref;

  const pendingRef = db.collection("pending_payments").doc(txRef);
  const pendingSnap = await pendingRef.get();

  if (!pendingSnap.exists) {
    return NextResponse.json({ error: "Transaction inconnue" }, { status: 404 });
  }

  const pending = pendingSnap.data();

  if (
    Number(data.amount) !== Number(pending.amount) ||
    data.currency !== pending.currency
  ) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  const walletRef = db.collection("wallets").doc(pending.userId);
  const transactionRef = db.collection("transactions").doc(txRef);

  await db.runTransaction(async (t) => {

    const walletSnap = await t.get(walletRef);
    let balances = walletSnap.exists ? walletSnap.data().balances : {};

    const currentBalance = balances[data.currency] || 0;
    balances[data.currency] = currentBalance + Number(data.amount);

    t.set(walletRef, {
      balances,
      updatedAt: new Date()
    }, { merge: true });

    t.set(transactionRef, {
      transactionId: txRef,
      userId: pending.userId,
      type: "topup",
      amount: data.amount,
      currency: data.currency,
      fee: 0,
      netAmount: data.amount,
      status: "success",
      createdAt: new Date()
    });

    t.set(db.collection("ledger").doc(), {
      userId: pending.userId,
      currency: data.currency,
      amount: data.amount,
      direction: "credit",
      reference: txRef,
      type: "topup",
      createdAt: new Date()
    });

    t.update(pendingRef, {
      status: "successful",
      updatedAt: new Date()
    });

  });

  return NextResponse.json({ received: true });
}