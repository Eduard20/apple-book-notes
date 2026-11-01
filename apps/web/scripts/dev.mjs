// Start `next dev` on a random free port (or PORT if set).
import { createServer } from "node:net";
import { spawn } from "node:child_process";

const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer().once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });

const port = process.env.PORT || (await freePort());
console.log(`\n  → http://localhost:${port}\n`);
const child = spawn("next", ["dev", "--port", String(port), ...process.argv.slice(2)], { stdio: "inherit", shell: true });
child.on("exit", (code) => process.exit(code ?? 0));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig));
