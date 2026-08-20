import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === "win32";
const startAI = process.argv.includes("--all");
const children = [];

function spawnChild(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: isWin, cwd: __dirname, ...opts });
  children.push(p);
  p.on("close", () => { children.splice(children.indexOf(p), 1); });
  return p;
}

if (startAI) {
  console.log("[dev] Starting Python AI backend...");
  spawnChild("python", ["main.py"], { cwd: resolve(__dirname, "swachhlens-ai") });
}

console.log("[dev] Starting Node backend...");
const node = spawnChild("node", ["server.js", "--port", "3000"]);

setTimeout(() => {
  console.log("[dev] Starting Vite frontend...");
  const vite = spawnChild("npx", ["vite"]);
  vite.on("close", (code) => process.exit(code ?? 0));
}, 5000);

node.on("close", () => process.exit(1));
process.on("SIGINT", () => { children.forEach((c) => c.kill()); process.exit(0); });
process.on("SIGTERM", () => { children.forEach((c) => c.kill()); process.exit(0); });
