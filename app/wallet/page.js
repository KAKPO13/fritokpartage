"use client"

import { useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { auth, db } from "@/lib/firebaseClient"

export default function WalletPage() {
  const [wallet, setWallet] = useState(null)

 useEffect(() => {
  if (!user) return;

  const q = query(
    collection(db, "wallet_transactions"),
    where("userId", "==", user.uid),
    orderBy("timestamp", "desc")
  );

  const unsubscribe = onSnapshot(q, snapshot => {
    const balances = {};

    snapshot.docs.forEach(docSnap => {
      const tx = docSnap.data();
      if (tx.status === "successful") {
        balances[tx.currency] =
          (balances[tx.currency] || 0) + tx.montantRecu;
      }
    });

    setWallet(balances);
  });

  return () => unsubscribe();
}, [user]);

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