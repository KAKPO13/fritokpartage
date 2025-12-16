// supabase/functions/create_live/index.ts

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Données envoyées par l'app
  const { seller_id, title } = await req.json();

  // Génération automatique d’un nom de channel unique
  const channelName = live_${seller_id}_${Date.now()};

  // Enregistrer le live dans la base
  const { data, error } = await supabase
    .from("lives")
    .insert({
      seller_id,
      title,
      channel_name: channelName,
      status: "live",
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  return new Response(JSON.stringify({ data, error }), {
    headers: { "Content-Type": "application/json" },
  });
});