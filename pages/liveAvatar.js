import Head from "next/head";
import { useRouter } from "next/router";

// ✅ Les meta OG sont générées CÔTÉ SERVEUR → Facebook/WhatsApp les lisent correctement
export async function getServerSideProps({ query }) {
  const { sessionId, sellerId, productId } = query;

  // 🔁 Récupère les vraies données depuis ton API
  let productImage = null;
  let productName = null;
  let sellerName = null;

  try {
    if (productId) {
      const res = await fetch(
        `https://api.fritok.net/products/${productId}`
      );
      if (res.ok) {
        const data = await res.json();
        productImage = data.imageUrl ?? null;
        productName = data.name ?? null;
      }
    }

    if (sellerId) {
      const res = await fetch(
        `https://api.fritok.net/sellers/${sellerId}`
      );
      if (res.ok) {
        const data = await res.json();
        sellerName = data.name ?? null;
      }
    }
  } catch (e) {
    // Silently fallback to defaults
  }

  return {
    props: {
      sessionId: sessionId ?? null,
      sellerId: sellerId ?? null,
      productId: productId ?? null,
      productImage,
      productName,
      sellerName,
    },
  };
}

export default function LiveAvatar({
  sessionId,
  sellerId,
  productId,
  productImage,
  productName,
  sellerName,
}) {
  const router = useRouter();

  // ✅ Métadonnées dynamiques selon le contexte
  const sellerLabel = sellerName ?? "un vendeur FriTok";
  const productLabel = productName ? ` · ${productName}` : "";
  
  const title = `🎬 Live de ${sellerLabel}${productLabel}`;
  const description = productName
    ? `${sellerLabel} présente "${productName}" en live. Rejoins maintenant pour acheter !`
    : `${sellerLabel} est en live sur FriTok. Rejoins le shopping en direct !`;

  // ✅ Priorité : image du produit → thumbnail du live → fallback générique
  const ogImage =
    productImage ??
    `https://fritok.net/api/og-image?sessionId=${sessionId}` ?? // image générée dynamiquement
    "https://fritok.net/og-default.jpg";

  const pageUrl = `https://fritok.net/liveAvatar?sessionId=${sessionId}&sellerId=${sellerId}${
    productId ? `&productId=${productId}` : ""
  }`;

  // ✅ Deep link vers l'app mobile
  const appDeepLink = `fritok://live/${sessionId}?sellerId=${sellerId}${
    productId ? `&productId=${productId}` : ""
  }`;

  // ✅ Fallback store si l'app n'est pas installée
  const fallbackUrl = `/open-app?sessionId=${sessionId}&sellerId=${sellerId}${
    productId ? `&productId=${productId}` : ""
  }`;

  const handleJoin = () => {
    // Tente d'ouvrir l'app, redirige vers store si échec
    window.location.href = appDeepLink;
    setTimeout(() => {
      window.location.href = fallbackUrl;
    }, 1500);
  };

  return (
    <>
      <Head>
        <title>{title}</title>

        {/* ── Open Graph ── */}
        <meta property="og:site_name" content="FriTok" />
        <meta property="og:type" content="video.other" />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={title} />
        <meta property="og:locale" content="fr_FR" />

        {/* ── Twitter Card ── */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={ogImage} />

        {/* ── Deep link mobile ── */}
        <meta name="apple-itunes-app" content={`app-id=TON_APP_ID, app-argument=${appDeepLink}`} />
      </Head>

      <main style={styles.container}>
        {/* Miniature produit ou live */}
        <div style={styles.imageWrapper}>
          <img
            src={ogImage}
            alt={productName ?? "Live FriTok"}
            style={styles.image}
          />
          {/* Badge LIVE animé */}
          <span style={styles.liveBadge}>● LIVE</span>
        </div>

        <h1 style={styles.title}>{title}</h1>
        <p style={styles.description}>{description}</p>

        <button onClick={handleJoin} style={styles.button}>
          👉 Rejoindre le live
        </button>

        <p style={styles.hint}>
          Vous serez redirigé vers l'application FriTok
        </p>
      </main>
    </>
  );
}

// ── Styles inline ──────────────────────────────────────────────
const styles = {
  container: {
    maxWidth: 480,
    margin: "0 auto",
    padding: 24,
    textAlign: "center",
    fontFamily: "sans-serif",
  },
  imageWrapper: {
    position: "relative",
    display: "inline-block",
    marginBottom: 16,
  },
  image: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 12,
    objectFit: "cover",
    aspectRatio: "16/9",
  },
  liveBadge: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "#e53935",
    color: "#fff",
    padding: "4px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: "bold",
    animation: "pulse 1.5s infinite",
  },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  description: { color: "#555", marginBottom: 24 },
  button: {
    backgroundColor: "#25D366",    // vert WhatsApp / CTA
    color: "#fff",
    border: "none",
    padding: "14px 28px",
    borderRadius: 30,
    fontSize: 16,
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
    maxWidth: 300,
  },
  hint: { marginTop: 12, fontSize: 12, color: "#999" },
};