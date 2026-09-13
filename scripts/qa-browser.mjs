import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const state = JSON.parse(readFileSync(".data/qa-session.json", "utf8"));
const script = `localStorage.setItem('sb-ruwclgmswqbgrfkgezsy-auth-token', ${JSON.stringify(JSON.stringify(state.session))}); 'Sessão QA carregada';`;
execFileSync(
  "cmd.exe",
  ["/d", "/s", "/c", "npx --yes agent-browser eval --stdin"],
  { input: script, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
);
console.log("Sessão temporária de QA carregada no navegador de testes.");
