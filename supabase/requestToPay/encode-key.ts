const path = "./service-account.json";
const json = JSON.parse(await Deno.readTextFile(path));

const rawKey = json.private_key;
if (!rawKey) throw new Error("Clé privée introuvable");

const encodedKey = rawKey.replace(/\n/g, "\\n");
console.log("\n✅ Clé encodée prête pour Supabase:\n");
console.log(encodedKey);
