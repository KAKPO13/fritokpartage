import forms from "@tailwindcss/forms";
import typography from "@tailwindcss/typography";
import scrollbar from "tailwind-scrollbar";

export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}", // ⚠️ ajouté — nécessaire si tu utilises l'App Router
  ],
  theme: {
    extend: {
      colors: {
        friPink: "#ec4899",
        friDark: "#1f1f1f",

        // ─────────────────────────────────────
        //  Tokens FriTok — miroir exact de la
        //  classe _C côté Flutter (mobile).
        //  Garder synchronisé avec lib/theme.js
        // ─────────────────────────────────────
        fritok: {
          orange: "#FF6B00",
          orangeLight: "#FF9A3C",
          orangeDark: "#CC5500",
          bg: "#FFF8F2",
          card: "#FFFFFF",
          cardAlt: "#FFF0E0",
          inputFill: "#FFFAF5",
          text: "#1A0A00",
          textSub: "#7A4A1E",
          textMuted: "#B07040",
          border: "#FFD4A8",
          divider: "#FFE0C0",
          green: "#2E7D32",
          greenLight: "#E8F5E9",
          red: "#C62828",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [forms, typography, scrollbar],
}