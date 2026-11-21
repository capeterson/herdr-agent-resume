// herdr-agent-resume omp session hook
// Notes this omp session on its Herdr terminal. The installer writes the script path.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const script = __SCRIPT__;
let noted = "";

function run(input) {
  return new Promise(resolve => {
    let out = "";
    let child;
    try {
      child = spawn("python3", [script, "hook", "omp"], { stdio: ["pipe", "pipe", "ignore"] });
    } catch {
      resolve(null);
      return;
    }
    const timer = setTimeout(() => child.kill(), 8000);
    child.stdout.on("data", chunk => { out += chunk; });
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", code => { clearTimeout(timer); resolve(code === 0 ? out : null); });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function note(_event, ctx) {
  // Extensions are rebound into every subagent, in the same process as the main
  // session: only the terminal's own interactive session is worth resuming.
  if (ctx.agent?.kind !== "main" || ctx.mode !== "tui") return;
  let file = "";
  let id = "";
  let cwd = "";
  try {
    file = ctx.sessionManager.getSessionFile() || "";
    id = ctx.sessionManager.getSessionId() || "";
    cwd = ctx.sessionManager.getCwd() || ctx.cwd || "";
  } catch {
    return;
  }
  // omp names the session file up front but writes it with the first message.
  if (!file || !id || !existsSync(file)) return;
  const key = id + "\0" + file;
  if (key === noted) return;
  const out = await run(JSON.stringify({
    hook_event_name: "SessionStart",
    session_id: id,
    transcript_path: file,
    cwd,
  }));
  if (out && out.trim()) noted = key;
}

export default function (pi) {
  pi.on("session_start", note);
  // /resume, /new, /fork and /move switch the session inside the same process.
  pi.on("session_switch", note);
  // A new session's file appears with the first message, after session_start.
  pi.on("agent_end", note);
}
