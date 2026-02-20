import { NextResponse } from "next/server"
import axios from "axios"
import { adminDb } from "@/lib/firebaseAdmin"
import { v4 as uuidv4 } from "uuid"

export async function POST(req) {
  try {
    const { amount, currency, userId } = await req.json()

    if (!amount || !currency || !userId) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      )
    }

    const tx_ref = `FRITOK-${uuidv4()}`

    // Save pending payment
    await adminDb.collection("pending_payments").doc(tx_ref).set({
      amount,
      currency,
      userId,
      status: "pending",
      tx_ref,
      createdAt: new Date()
    })

    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref,
        amount,
        currency,
        redirect_url: `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success`,
        customer: {
          email: "customer@example.com"
        },
        customizations: {
          title: "Wallet Topup"
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
        }
      }
    )

    return NextResponse.json(response.data)
  } catch (error) {
    console.error("PAY ERROR:", error.response?.data || error.message)
    return NextResponse.json(
      { error: "Payment initialization failed" },
      { status: 500 }
    )
  }
}