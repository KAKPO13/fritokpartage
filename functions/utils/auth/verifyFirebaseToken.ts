
interface VerifiedUser {
  uid: string
  email?: string
}

export async function verifyFirebaseToken(token: string): Promise<VerifiedUser> {
  const projectId = Deno.env.get("FIREBASE_PROJECT_ID")
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID non défini")

  const [headerB64, payloadB64, signatureB64] = token.split(".")
  if (!headerB64 || !payloadB64 || !signatureB64) throw new Error("Token mal formé")

  const { header, payload } = decode(token)
  const { kid, alg } = header
  if (alg !== "RS256") throw new Error("Algorithme non supporté")

  const jwksUrl = "https://www.googleapis.com/service_accounts/v1/metadata/x509/securetoken@system.gserviceaccount.com"
  const jwks = await fetch(jwksUrl).then(res => res.json())
  const pem = jwks[kid]
  if (!pem) throw new Error("Clé publique introuvable pour ce kid")

  const cryptoKey = await crypto.subtle.importKey(
    "spki",
    convertPemToSpki(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  )

  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64urlDecode(signatureB64),
    new TextEncoder().encode(`${headerB64}.${payloadB64}`)
  )

  if (!valid) throw new Error("Signature invalide")

  const expectedIss = `https://securetoken.google.com/${projectId}`
  if (payload.iss !== expectedIss || payload.aud !== projectId) {
    throw new Error("Token non destiné à ce projet")
  }

  if (Date.now() / 1000 > payload.exp) {
    throw new Error("Token expiré")
  }

  return {
    uid: payload.user_id,
    email: payload.email
  }
}

// 🔧 Convert PEM string to ArrayBuffer
function convertPemToSpki(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*?-----|-----END.*?-----|\n/g, "")
  const binary = atob(b64)
  const buffer = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i)
  return buffer.buffer
}

// 🔧 Decode base64url to Uint8Array
function base64urlDecode(input: string): Uint8Array {
  const pad = "=".repeat((4 - (input.length % 4)) % 4)
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/")
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
