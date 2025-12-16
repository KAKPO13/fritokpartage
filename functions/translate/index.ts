import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  const { text, source, target } = await req.json();

  const res = await fetch(
    "https://mt.aliyuncs.com/api/translate/web/general", 
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-APISpace-Token": Deno.env.get("ALI_TRANSLATE_KEY")!,
      },
      body: JSON.stringify({
        q: text,
        source,
        target,
      })
    }
  );

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" }
  });
});