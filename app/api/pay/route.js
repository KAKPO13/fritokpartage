import { NextResponse } from "next/server";
import axios from "axios";
import { db } from "@/lib/firebaseAdmin";

export async function POST(req) {
  try {
    const { userId, email, amount, currency } = await req.json();

    if (!userId || !email || !amount || !currency) {
      return NextResponse.json({ error: "Paramètre manquant" }, { status: 400 });
    }

    const tx_ref = `FRITOK-${crypto.randomUUID()}`;

    // Enregistrer pending
    await db.collection("pending_payments").doc(tx_ref).set({
      userId,
      amount: Number(amount),
      currency,
      status: "pending",
      tx_ref,
      createdAt: new Date(),
    });

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref,
        amount,
        currency,
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success`,
        payment_options: "card,mobilemoney",
        customer: { email },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
        },
      }
    );

    return NextResponse.json({
      payment_url: response.data.data.link,
    });

  } catch (err) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}