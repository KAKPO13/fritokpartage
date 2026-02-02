// api/create-job.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function handler(event) {
  try {
    const { images, musicUrl, title, price } = JSON.parse(event.body);

    if (!images || images.length === 0) {
      return { statusCode: 400, body: "Aucune image fournie" };
    }

    // Crée un job en base
    const { data: job, error } = await supabase
      .from("video_jobs")
      .insert({
        images,
        music_url: musicUrl || null,
        title: title || "Produit",
        price: price || "0.00€",
        status: "queued" // statut initial
      })
      .select()
      .single();

    if (error) throw error;

    return { statusCode: 200, body: JSON.stringify({ jobId: job.id, status: "queued" }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}