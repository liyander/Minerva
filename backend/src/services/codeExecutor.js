// Server-side (cheat-proof) code execution for the Lab Research code lab.
// The submitted solve(input) implementation is re-run on the server in a
// short-lived child process with a hard timeout, and pass/fail is decided
// here — client-reported results are never trusted for acceptance.

import { spawn } from 'node:child_process'

const EXEC_TIMEOUT_MS = 10000
const MAX_OUTPUT_BYTES = 1024 * 1024

const JS_HARNESS = `
let raw = '';
process.stdin.on('data', (d) => { raw += d; });
process.stdin.on('end', () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { console.log(JSON.stringify({ error: 'Invalid payload' })); return; }
  let solve;
  try {
    const factory = new Function(payload.code + '\\n;return (typeof solve === "function") ? solve : undefined;');
    solve = factory();
  } catch (error) {
    console.log(JSON.stringify({ error: 'Your code failed to load: ' + (error && error.message ? error.message : String(error)) }));
    return;
  }
  if (typeof solve !== 'function') {
    console.log(JSON.stringify({ error: 'No solve(input) function was found in your code.' }));
    return;
  }
  const results = [];
  for (const test of payload.tests) {
    try {
      const output = solve(test.input);
      results.push({ ok: true, output: output === undefined ? 'undefined' : JSON.stringify(output) });
    } catch (error) {
      results.push({ ok: false, message: String(error && error.message ? error.message : error) });
    }
  }
  console.log(JSON.stringify({ results }));
});
`

const PY_HARNESS = `
import sys, json
raw = sys.stdin.read()
try:
    payload = json.loads(raw)
except Exception:
    print(json.dumps({"error": "Invalid payload"})); sys.exit(0)
ns = {}
try:
    exec(payload["code"], ns)
except Exception as e:
    print(json.dumps({"error": "Your code failed to load: %s" % e})); sys.exit(0)
solve = ns.get("solve")
if not callable(solve):
    print(json.dumps({"error": "No solve(input) function was found in your code."})); sys.exit(0)
results = []
for test in payload["tests"]:
    try:
        results.append({"ok": True, "output": json.dumps(solve(test["input"]))})
    except Exception as e:
        results.append({"ok": False, "message": str(e)})
print(json.dumps({"results": results}))
`

function runProcess(command, args, payload) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        env: { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT },
      })
    } catch (error) {
      resolve({ spawnFailed: true, error })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    const timeoutId = setTimeout(() => {
      try { child.kill('SIGKILL') } catch { /* already dead */ }
      finish({ timedOut: true })
    }, EXEC_TIMEOUT_MS)

    child.on('error', (error) => {
      clearTimeout(timeoutId)
      finish({ spawnFailed: true, error })
    })
    child.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) stdout += data
    })
    child.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) stderr += data
    })
    child.on('close', (exitCode) => {
      clearTimeout(timeoutId)
      finish({ exitCode, stdout, stderr })
    })

    try {
      child.stdin.write(JSON.stringify(payload))
      child.stdin.end()
    } catch {
      // The close handler will still fire.
    }
  })
}

function parseHarnessOutput(run, testCount) {
  if (run.timedOut) {
    return { supported: true, error: `Execution timed out after ${EXEC_TIMEOUT_MS / 1000}s — check for infinite loops.` }
  }
  if (run.spawnFailed) {
    return { supported: false }
  }
  let parsed = null
  const lastLine = String(run.stdout || '').trim().split('\n').pop() || ''
  try {
    parsed = JSON.parse(lastLine)
  } catch {
    parsed = null
  }
  if (!parsed) {
    const stderrTail = String(run.stderr || '').trim().split('\n').filter(Boolean).slice(-2).join(' ')
    return { supported: true, error: stderrTail ? `Execution failed: ${stderrTail.slice(0, 500)}` : 'Execution produced no readable result.' }
  }
  if (parsed.error) {
    return { supported: true, error: String(parsed.error).slice(0, 1000) }
  }
  const runs = Array.isArray(parsed.results) ? parsed.results : []
  if (runs.length !== testCount) {
    return { supported: true, error: 'Execution did not produce a result for every test case.' }
  }
  return { supported: true, runs }
}

async function executeJavaScript(code, tests) {
  const payload = { code, tests }
  // Node's permission model blocks fs, child processes, and workers inside
  // the harness. Older Node versions without the flag fall back to plain -e.
  let run = await runProcess(process.execPath, ['--permission', '-e', JS_HARNESS], payload)
  const flagRejected = run.spawnFailed ||
    (run.exitCode !== 0 && /bad option|not allowed|--permission/i.test(String(run.stderr || '')) && !String(run.stdout || '').trim())
  if (flagRejected) {
    run = await runProcess(process.execPath, ['-e', JS_HARNESS], payload)
  }
  return parseHarnessOutput(run, tests.length)
}

async function executePython(code, tests) {
  const payload = { code, tests }
  const candidates = process.platform === 'win32'
    ? [['py', ['-3', '-c', PY_HARNESS]], ['python', ['-c', PY_HARNESS]], ['python3', ['-c', PY_HARNESS]]]
    : [['python3', ['-c', PY_HARNESS]], ['python', ['-c', PY_HARNESS]]]
  for (const [command, args] of candidates) {
    const run = await runProcess(command, args, payload)
    if (run.spawnFailed) continue
    const parsed = parseHarnessOutput(run, tests.length)
    if (parsed.supported) return parsed
  }
  return { supported: false }
}

// Runs the code server-side against the test inputs.
// Returns { supported, error?, runs?: [{ ok, output?, message? }] }.
export async function executeCodeOnServer(language, code, tests) {
  const normalized = String(language || '').toLowerCase()
  if (normalized === 'python') {
    return executePython(code, tests)
  }
  if (normalized === 'javascript') {
    return executeJavaScript(code, tests)
  }
  const label = { c: 'C', cpp: 'C++', java: 'Java' }[normalized] || normalized || 'Selected language'
  return { supported: false, error: `${label} execution requires a secure compiler sandbox, which is not configured on this server.` }
}
