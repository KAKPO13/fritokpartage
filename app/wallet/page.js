"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { auth, db } from "@/lib/firebaseClient"

export default function WalletPage() {
  const [wallet, setWallet] = useState(null)

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (!user) return

      const userRef = doc(db, "users", user.uid)

      const unsubscribeSnapshot = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          setWallet(snap.data().wallet)
        }
      })

      return () => unsubscribeSnapshot()
    })

    return () => unsubscribeAuth()
  }, [])

  if (!wallet) return <div>Loading...</div>

  return (
    <div>
      <h1>Wallet</h1>
      <p>XOF: {wallet.XOF}</p>
      <p>GHS: {wallet.GHS}</p>
      <p>NGN: {wallet.NGN}</p>
    </div>
  )
}