'use client';
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "../../lib/firebaseClient";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("Client");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!email || !password || !username) return alert("Tous les champs sont requis");
    setLoading(true);

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      // Envoie de l'email de vérification
      await cred.user.sendEmailVerification();

      // Création du user Firestore
      await setDoc(doc(db, "users", cred.user.uid), {
        userId: cred.user.uid,
        email,
        username,
        role,
        kyc_status: role === "Vendeur" ? "pending" : "approved",
        wallet: { XOF: 0, GHS: 0, NGN: 0 },
        createdAt: new Date(),
      });

      alert("Compte créé ! Vérifiez votre email avant de vous connecter.");
      router.push("/login");
    } catch (e) {
      console.error(e);
      alert("Erreur inscription : " + e.message);
    }

    setLoading(false);
  };

  const handleGoogleRegister = async () => {
    setLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const cred = await signInWithPopup(auth, provider);
      const user = cred.user;

      // Vérifie si déjà enregistré
      const userDoc = await doc(db, "users", user.uid).get?.();
      if (!userDoc?.exists()) {
        // Crée le user Firestore
        await setDoc(doc(db, "users", user.uid), {
          userId: user.uid,
          email: user.email,
          username: user.displayName || "GoogleUser",
          role,
          kyc_status: role === "Vendeur" ? "pending" : "approved",
          wallet: { XOF: 0, GHS: 0, NGN: 0 },
          createdAt: new Date(),
        });
      }

      alert("Compte Google créé avec succès !");
      router.push("/login");
    } catch (e) {
      console.error(e);
      alert("Erreur Google Sign-In : " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 400, margin: "50px auto", padding: 20 }}>
      <h2>Inscription</h2>
      <input
        type="text"
        placeholder="Nom d'utilisateur"
        value={username}
        onChange={e => setUsername(e.target.value)}
        style={{ width: "100%", marginBottom: 10, padding: 8 }}
      />
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
      <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%", marginBottom: 10, padding: 8 }}>
        <option value="Client">Client</option>
        <option value="Livreur">Livreur</option>
        <option value="Vendeur">Vendeur</option>
      </select>
      <button onClick={handleRegister} disabled={loading} style={{ width: "100%", padding: 10, marginBottom: 10 }}>
        {loading ? "Création..." : "Créer un compte"}
      </button>
      <button
        onClick={handleGoogleRegister}
        disabled={loading}
        style={{ width: "100%", padding: 10, background: "#4285F4", color: "#fff" }}
      >
        {loading ? "Connexion..." : "S'inscrire avec Google"}
      </button>
      <p style={{ marginTop: 20 }}>
        Déjà un compte ? <a href="/login">Se connecter</a>
      </p>
    </div>
  );
}
