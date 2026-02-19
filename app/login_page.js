'use client';
import React, { useState, useEffect } from "react";
import { auth, db } from "../lib/firebaseClient";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (user && user.emailVerified) {
      redirectUser(user.uid);
    }
  }, []);

  const redirectUser = async (uid) => {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return;

    const data = userDoc.data();
    const role = data.role || "Client";
    const kyc = data.kyc_status || "pending";

    // Charger wallet dans localStorage
    localStorage.setItem("wallet", JSON.stringify(data.wallet || {}));

    // Redirection
    if (role === "Vendeur" && kyc !== "approved") router.push("/kyc");
    else if (role === "Vendeur") router.push("/vendeur/home");
    else if (role === "Livreur") router.push("/livreur/home");
    else router.push("/client/home");
  };

  const handleLogin = async () => {
    if (!email || !password) return alert("Email et mot de passe requis");
    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        alert("Veuillez vérifier votre email avant de vous connecter");
        setLoading(false);
        return;
      }
      await redirectUser(cred.user.uid);
    } catch (e) {
      console.error(e);
      alert("Erreur connexion : " + e.message);
    }

    setLoading(false);
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();

    try {
      const cred = await signInWithPopup(auth, provider);
      const user = cred.user;

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        alert("Utilisateur Google non enregistré. Veuillez vous inscrire d'abord.");
        setLoading(false);
        return;
      }

      await redirectUser(user.uid);
    } catch (e) {
      console.error(e);
      alert("Erreur Google Sign-In : " + e.message);
    }

    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto", padding: 20 }}>
      <h2>Connexion</h2>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ width: "100%", marginBottom: 10, padding: 8 }}
      />
      <input
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ width: "100%", marginBottom: 10, padding: 8 }}
      />
      <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: 10, marginBottom: 10 }}>
        {loading ? "Connexion..." : "Se connecter"}
      </button>
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        style={{ width: "100%", padding: 10, background: "#4285F4", color: "#fff" }}
      >
        {loading ? "Connexion..." : "Se connecter avec Google"}
      </button>
      <p style={{ marginTop: 20 }}>
        Pas de compte ? <a href="/register_page">Inscrivez-vous</a>
      </p>
    </div>
  );
}
