import { useEffect } from "react";
import { useRouter } from "next/router";

export default function OpenApp() {
  const router = useRouter();
  const { sessionId, sellerId, productId } = router.query;

  useEffect(() => {
    if (!sessionId) return;

    const deepLink = `fritok://liveAvatar?sessionId=${sessionId}&sellerId=${sellerId}&productId=${productId}`;
    const fallback = `/guest?sessionId=${sessionId}`;

    // Tentative ouverture app
    window.location.href = deepLink;

    // Fallback web après 1.5s
    setTimeout(() => {
      window.location.href = fallback;
    }, 1500);
  }, [sessionId]);

  return (
    <p style={{ padding: 24 }}>
      🔄 Ouverture du live FriTok…
    </p>
  );
}