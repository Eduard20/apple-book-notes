// Start `next dev` on a random port that stays the same between runs (so the iPhone app can find it).
// Override with PORT=1234. The chosen port is remembered in data/.port.
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const PORT_FILE = resolve(import.meta.dirname, "../../../data/.port");

const isFree = (port) =>
  new Promise((ok) => {
    const srv = createServer().once("error", () => ok(false));
    srv.listen(port, "0.0.0.0", () => srv.close(() => ok(true)));
  });

const randomFree = () =>
  new Promise((ok, fail) => {
    const srv = createServer().once("error", fail);
    srv.listen(0, "0.0.0.0", () => {
      const { port } = srv.address();
      srv.close(() => ok(port));
    });
  });

async function pickPort() {
  if (process.env.PORT) return Number(process.env.PORT);
  const saved = existsSync(PORT_FILE) ? Number(readFileSync(PORT_FILE, "utf8")) : 0;
  if (saved && (await isFree(saved))) return saved;
  const port = await randomFree();
  mkdirSync(dirname(PORT_FILE), { recursive: true });
  writeFileSync(PORT_FILE, String(port));
  return port;
}

const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i && i.family === "IPv4" && !i.internal)?.address;

const port = await pickPort();
console.log(`\n  Web:    http://localhost:${port}`);
if (lanIp) console.log(`  iPhone: ${lanIp}:${port}   ← enter this in the app's Settings\n`);

// Run Next's CLI with this same Node binary: works with or without `npm run`, no shell needed.
const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "--hostname", "0.0.0.0", "--port", String(port), ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ABN_LAN_ADDRESS: lanIp ? `${lanIp}:${port}` : "" },
});
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
