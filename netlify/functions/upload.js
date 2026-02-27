import { createClient } from '@supabase/supabase-js'
import admin from 'firebase-admin'

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  })
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE
)

export const handler = async (event) => {
  try {
    const token = event.headers.authorization

    if (!token) {
      return { statusCode: 401, body: 'Unauthorized' }
    }

    const decoded = await admin.auth().verifyIdToken(token)
    const userId = decoded.uid

    return {
      statusCode: 200,
      body: JSON.stringify({ uid: userId })
    }

  } catch (error) {
    return {
      statusCode: 500,
      body: error.message
    }
  }
}