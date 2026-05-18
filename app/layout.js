import './globals.css';

export const metadata = {
  title: 'FriTok – Vitrines e-commerce interactives',
  description: "FriTok transforme vos produits en vitrines interactives — vidéos, live shopping, recherche vocale et suivi de livraison.",
  openGraph: {
    title: 'FriTok – Vitrines e-commerce interactives',
    description: "L'e-commerce made in Afrique.",
    type: 'website',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}

