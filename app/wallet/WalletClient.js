"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { db, auth } from "../../lib/firebaseClient";

export default function WalletClient() {
  const [user, setUser] = useState(null);
  const [wallet, setWallet] = useState({});

  // 🔐 Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
    });

    return () => unsubscribe();
  }, []);

  // 💰 Wallet listener
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "wallet_transactions"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const balances = {};

      snapshot.docs.forEach((doc) => {
        const tx = doc.data();

        if (tx.status === "success") {
          balances[tx.currency] =
            (balances[tx.currency] || 0) + tx.amount;
        }
      });

      setWallet(balances);
    });

    return () => unsubscribe();
  }, [user]);

  if (!user) {
    return <div>Connexion requise</div>;
  }

  return (
    <div>
      <h1>Mon Wallet</h1>

      {Object.keys(wallet).length === 0 && (
        <p>Aucune transaction</p>
      )}

      {Object.entries(wallet).map(([currency, amount]) => (
        <div key={currency}>
          {currency} : {amount}
        </div>
      ))}
    </div>
  );
}