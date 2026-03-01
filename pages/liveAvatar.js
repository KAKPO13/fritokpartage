import Head from "next/head";
import { useRouter } from "next/router";

export default function LiveAvatar() {
  const router = useRouter();
  const { sessionId, sellerId, productId } = router.query;

  const title = "🎬 Live Shopping en direct sur FriTok";
  const description =
    "Rejoignez le live maintenant et achetez les produits en temps réel.";
  const image =
    "https://fritok.net/live-preview.jpg"; // remplace par image dynamique si besoin

  const openAppUrl = `/open-app?sessionId=${sessionId}&sellerId=${sellerId}&productId=${productId}`;

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* OpenGraph */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={`https://fritok.net/liveAvatar?sessionId=${sessionId}`} />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
      </Head>

      <main style={{ padding: 24, textAlign: "center" }}>
        <h1>🎬 Live FriTok</h1>
        <p>Un live shopping est en cours</p>

        <a href={openAppUrl}>
          <button style={{ padding: 14, fontSize: 16 }}>
            👉 Rejoindre le live
          </button>
        </a>
      </main>
    </>
  );
}