import { useRouter } from "next/router";

export default function LiveAvatarEmbed() {
  const router = useRouter();
  const { sessionId } = router.query;

  if (!sessionId) return null;

  return (
    <html>
      <head>
        <title>Live Avatar</title>
        <meta name="robots" content="noindex" />
      </head>
      <body style={{ margin: 0, background: "black" }}>
        <iframe
          src={`fritok://liveAvatar?sessionId=${sessionId}`}
          style={{
            width: "100vw",
            height: "100vh",
            border: "none",
          }}
          allow="autoplay; fullscreen"
        />
      </body>
    </html>
  );
}