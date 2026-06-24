import './globals.css';
import InstallButton from '../components/InstallButton';

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
      { url: '/icon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icon-192x192.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/manifest.json',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <nav className="flex justify-between items-center p-4 bg-gray-100">
          <span className="font-bold text-lg">FriTok</span>
          <InstallButton />
        </nav>
        {children}
      </body>
    </html>
  );
}

