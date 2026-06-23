import './globals.css';

export const metadata = {
  title: 'FriTok – Vitrines e-commerce interactives',
  description: "FriTok transforme vos produits en vitrines interactives — vidéos, live shopping, recherche vocale et suivi de livraison.",
  openGraph: {
    title: 'FriTok – Vitrines e-commerce interactives',
    description: "L'e-commerce made in Afrique.",
    type: 'website',
  },
  icons: {
    icon: [
      { url: '/icon.png', sizes: '32x32', type: 'image/png' },   // favicon classique
      { url: '/icon.png', sizes: '192x192', type: 'image/png' }, // Android/Chrome
      { url: '/icon.png', sizes: '512x512', type: 'image/png' }, // PWA
    ],
    apple: [
      { url: '/icon.png', sizes: '180x180', type: 'image/png' }, // iOS homescreen
    ],
  },
  manifest: '/manifest.json', // pour PWA si tu en as un
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
