import { NextResponse } from "next/server"
import axios from "axios"
import { adminDb } from "@/lib/firebaseAdmin"
import { v4 as uuidv4 } from "uuid"

export async function POST(req) {
  try {
    const { userId, email, productId } = await req.json()

    if (!userId || !email || !productId) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      )
    }

    // 1️⃣ Get product from DB
    const productSnap = await adminDb
      .collection("products")
      .doc(productId)
      .get()

    if (!productSnap.exists) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 }
      )
    }

    const product = productSnap.data()

    const amount = product.price
    const currency = product.currency || "GHS"

    const tx_ref = `FRITOK-${uuidv4()}`

    // 2️⃣ Save pending payment
    await adminDb.collection("pending_payments").doc(tx_ref).set({
      userId,
      productId,
      amount,
      currency,
      status: "pending",
      tx_ref,
      createdAt: new Date(),
    })

    // 3️⃣ Call Flutterwave
    const flwResponse = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref,
        amount,
        currency,
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success`,
        customer: {
          email,
        },
        customizations: {
          title: "FriTok Payment",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        },
      }
    )

    return NextResponse.json(flwResponse.data)

  } catch (error) {
    console.error("PAY ERROR:", error.response?.data || error.message)

    return NextResponse.json(
      { error: "Payment initialization failed" },
      { status: 500 }
    )
  }
}