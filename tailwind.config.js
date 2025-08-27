/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",      // pour React
    "./pages/**/*.{js,ts,jsx,tsx}",    // pour Next.js
    "./components/**/*.{js,ts,jsx,tsx}" // si tu as un dossier composants
  ],
  theme: {
    extend: {
      colors: {
        friPink: "#ec4899",
        friDark: "#1f1f1f",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("tailwind-scrollbar"),
  ],
}

