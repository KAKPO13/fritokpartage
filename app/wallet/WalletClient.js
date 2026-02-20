"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, onSnapshot } from "firebase/firestore";
import { db, useAuth } from "../../lib/firebaseClient";


export default function WalletClient() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState({});

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "wallet_transactions"),
      where("userId", "==", user.uid),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const balances = {};

      snapshot.docs.forEach((doc) => {
        const tx = doc.data();

        if (tx.status === "successful") {
          balances[tx.currency] =
            (balances[tx.currency] || 0) + tx.montantRecu;
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