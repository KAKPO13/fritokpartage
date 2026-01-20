import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  try {
    const { bucket, fileName, fileBase64 } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Convertir base64 en Uint8Array
    const binaryString = atob(fileBase64);
    const fileBuffer = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      fileBuffer[i] = binaryString.charCodeAt(i);
    }

    // Upload vers Supabase Storage
    const { error } = await supabase.storage
      .from(bucket)
      .upload(fileName, fileBuffer, {
        contentType: "application/octet-stream",
        upsert: true,
      });

    if (error) throw error;

    // ✅ Utiliser une template string pour l’URL publique
    const publicUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/${bucket}/${fileName}`;

    return new Response(JSON.stringify({ publicUrl }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500 }
    );
  }
});
