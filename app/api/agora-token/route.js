import { RtcTokenBuilder, RtcRole } from 'agora-token';
import { NextResponse } from 'next/server';

// Token valable 2 heures
const TOKEN_EXPIRY_SECONDS = 7200;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const channelId = searchParams.get('channelId');

  if (!channelId) {
    return NextResponse.json(
      { error: 'channelId requis' },
      { status: 400 }
    );
  }

  const appId          = process.env.NEXT_PUBLIC_AGORA_APP_ID;
  const appCertificate = process.env.AGORA_APP_CERTIFICATE;

  if (!appId || !appCertificate) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_AGORA_APP_ID ou AGORA_APP_CERTIFICATE manquant' },
      { status: 500 }
    );
  }

  try {
    const now        = Math.floor(Date.now() / 1000);
    const expireTime = now + TOKEN_EXPIRY_SECONDS;

    // uid = 0 → Agora génère un uid aléatoire pour ce spectateur
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelId,
      0,                   // uid spectateur
      RtcRole.SUBSCRIBER,  // rôle audience
      expireTime,
      expireTime
    );

    return NextResponse.json({ token, expireTime });
  } catch (err) {
    console.error('Agora token error:', err);
    return NextResponse.json(
      { error: 'Impossible de générer le token : ' + err.message },
      { status: 500 }
    );
  }
}
