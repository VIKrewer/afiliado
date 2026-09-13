import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const production = process.argv.includes("--production");
const children = [];
const run = (args) => {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...(production ? { NODE_ENV: "production" } : {}) },
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code) {
      for (const c of children) c.kill();
      process.exitCode = code;
    }
  });
  return child;
};
const compiler = run([
  require.resolve("typescript/bin/tsc"),
  "-p",
  "server/tsconfig.json",
]);
await new Promise((resolve) => compiler.on("exit", resolve));
if (compiler.exitCode !== 0) process.exit(1);
run(["dist-api/main.js"]);
run([
  require.resolve("next/dist/bin/next"),
  production ? "start" : "dev",
  "--hostname",
  production ? "0.0.0.0" : "127.0.0.1",
]);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    for (const child of children) child.kill(signal);
    process.exit();
  });
