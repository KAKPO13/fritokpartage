import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { OpenAI } from "https://esm.sh/openai";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!
);

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

serve(async (req) => {
  try {
    const body = await req.json();
    const { occasion, personnalité, préférences, certifications } = body;

    if (!occasion || !personnalité || !préférences) {
      return new Response(
        JSON.stringify({ error: "Champs requis manquants" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: parfums, error } = await supabase.from("parfums").select("*");
    if (error || !parfums) {
      console.error("Erreur chargement parfums :", error);
      return new Response(
        JSON.stringify({ error: "Erreur chargement parfums" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const filtrés = certifications?.length
      ? parfums.filter((p) =>
          p.certifications?.some((c: string) => certifications.includes(c))
        )
      : parfums;

    const scored = filtrés
      .map((p) => ({
        ...p,
        score: calculerScore(p, occasion, personnalité, préférences),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const enrichis = await Promise.all(
      scored.map(async (parfum) => {
        try {
          const description = await genererDescription(parfum);
          return { ...parfum, description };
        } catch (err) {
          console.error("Erreur OpenAI :", err);
          return { ...parfum, description: "Description indisponible." };
        }
      })
    );

    return new Response(JSON.stringify(enrichis), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Erreur serveur :", err);
    return new Response(
      JSON.stringify({ error: "Erreur interne" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function calculerScore(p: any, occasion: string, personnalité: string, prefs: any): number {
  let score = 0;
  if (p.occasions?.includes(occasion)) score += 3;
  if (p.personnalité_ciblée?.includes(personnalité)) score += 2;
  score += p.familles_olfactives?.filter((f: string) => prefs.familles_olfactives.includes(f)).length || 0;
  score += p.notes?.filter((n: string) => prefs.notes_favorisées.includes(n)).length || 0;
  if (p.intensité === prefs.intensité) score += 1;
  return score;
}

async function genererDescription(parfum: any): Promise<string> {
  const prompt = `Décris un parfum ${parfum.familles_olfactives.join(", ")} avec des notes de ${parfum.notes.join(", ")}. Il est ${parfum.intensité} et idéal pour une personne ${parfum.personnalité_ciblée.join(", ")} lors d'une ${parfum.occasions.join(", ")}. Utilise un ton poétique et émotionnel.`;

  console.log("Prompt OpenAI :", prompt);

  const completion = await openai.chat.completions.create({
    messages: [
      { role: "system", content: "Tu es un expert en parfumerie." },
      { role: "user", content: prompt },
    ],
    model: "gpt-4o", // ✅ modèle confirmé disponible
    temperature: 0.8,
  });

  const description = completion.choices?.[0]?.message?.content;
  console.log("Réponse OpenAI :", description);

  return description ?? "Description indisponible.";
}
