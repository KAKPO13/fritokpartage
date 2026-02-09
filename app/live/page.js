// app/live/page.js
import dynamic from "next/dynamic";

// Import du composant client avec SSR désactivé
const LiveClient = dynamic(() => import("./LiveClient"), { ssr: false });

export default function Page() {
  return <LiveClient />;
}
