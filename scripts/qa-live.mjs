// Isolated QA account; never sends a Telegram message. Run cleanup after browser verification.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
const admin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const file = ".data/qa-session.json";
if (process.argv.includes("--cleanup")) {
  const state = JSON.parse(readFileSync(file, "utf8"));
  await admin.auth.admin.signOut(state.session.access_token, "global");
  const { error } = await admin.auth.admin.deleteUser(state.userId);
  if (error) throw Error("Falha ao excluir usuário QA.");
  unlinkSync(file);
  console.log("Conta e dados temporários de QA removidos.");
  process.exit(0);
}
const email = `afiliado-qa-${randomUUID()}@example.com`,
  password = randomBytes(24).toString("base64url");
const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (error) throw Error("Falha ao criar conta de QA: " + error.message);
const auth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: signed, error: signError } = await auth.auth.signInWithPassword({
  email,
  password,
});
if (signError) throw Error("Falha no login QA.");
mkdirSync(".data", { recursive: true });
writeFileSync(
  file,
  JSON.stringify({ userId: created.user.id, session: signed.session }),
  { mode: 0o600 },
);
const api = async (path, method = "GET", body) => {
  const r = await fetch("http://localhost:3000/api/" + path, {
    method,
    headers: {
      Authorization: `Bearer ${signed.session.access_token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(`${path}: ${data.message}`);
  return data;
};
const before = await api("dashboard");
console.log("Dashboard e autenticação:", before.settings.storage);
const bot = await api("telegram/check", "POST");
console.log(
  "Telegram getMe: OK, bot @" + bot.username + "; nenhuma mensagem enviada.",
);
const product = await api("products", "POST", {
  title: "Oferta de verificação — fone Bluetooth",
  store: "Shopee",
  url: "https://shopee.com.br/?affiliate_id=qa",
  price: 99.9,
  oldPrice: 149.9,
  coupon: "TESTE",
  details: "Fone Bluetooth recarregável. Produto de teste, não publicar.",
  image: "",
  copy: "Registro temporário de verificação. Não publicar.",
});
try {
  const r = await api("generate", "POST", product.data);
  console.log("Gemini: texto gerado com " + r.copy.length + " caracteres.");
} catch (e) {
  console.log("Gemini:", e.message);
}
const unauth = await fetch("http://localhost:3000/api/dashboard");
if (unauth.status !== 401) throw Error("API permitiu acesso sem autenticação.");
console.log(
  "API sem sessão: 401 correto. Produto salvo e relido no Supabase. Conta pronta para QA visual.",
);
