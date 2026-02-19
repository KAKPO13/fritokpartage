'use client';

import React, { useEffect, useState } from "react";
import { auth } from "../lib/firebaseClient";
import { useRouter } from "next/navigation";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setInterval(() => setCooldown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [cooldown]);

  const snack = (msg) => alert(msg);

  /// 🔍 Vérifier si l’email est validé
  const checkVerification = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) return;

      await user.reload();

      if (user.emailVerified) {
        snack("✅ Email vérifié !");
        router.replace("/splash"); // redirige vers le SplashScreen intelligent
      } else {
        snack("❌ Email non vérifié. Vérifiez votre boîte mail.");
      }
    } catch (e) {
      console.error(e);
      snack("Erreur lors de la vérification");
    }
    setLoading(false);
  };

  /// 📨 Renvoyer l’email de vérification avec cooldown
  const resendVerificationEmail = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await user.sendEmailVerification();
      snack(`📨 Email de vérification renvoyé à ${user.email}`);

      setCooldown(30);
    } catch (e) {
      console.error(e);
      snack("Erreur lors de l'envoi de l'email");
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      padding: 24,
      textAlign: "center",
      background: "#f5f5f5"
    }}>
      <h1>📧 Vérification Email</h1>
      <p>
        Un email de vérification vous a été envoyé.<br />
        Cliquez sur le lien dans votre boîte mail, puis appuyez sur le bouton ci-dessous.
      </p>

      <button
        onClick={checkVerification}
        disabled={loading}
        style={{
          marginTop: 24,
          padding: "12px 24px",
          fontSize: 16,
          backgroundColor: "green",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "Vérification..." : "J'ai vérifié mon email"}
      </button>

      <button
        onClick={resendVerificationEmail}
        disabled={cooldown > 0}
        style={{
          marginTop: 16,
          padding: "12px 24px",
          fontSize: 16,
          backgroundColor: "blue",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: cooldown > 0 ? "not-allowed" : "pointer"
        }}
      >
        {cooldown > 0
          ? `Attendez ${cooldown} s...`
          : "📨 Renvoyer l'email de vérification"}
      </button>
    </div>
  );
}
