"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebaseClient";

export default function WalletPage() {

  const [wallet, setWallet] = useState({});

  useEffect(() => {

    const unsubAuth = auth.onAuthStateChanged(user => {
      if (!user) return;

      const unsubWallet = onSnapshot(
        doc(db, "wallets", user.uid),
        (snap) => {
          if (snap.exists()) {
            setWallet(snap.data().balances);
          }
        }
      );

      return unsubWallet;
    });

    return () => unsubAuth();

  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h1>Mon Wallet</h1>
      {Object.entries(wallet).map(([cur, val]) => (
        <p key={cur}>{cur} : {val}</p>
      ))}
    </div>
  );
}