// aether-host.js — Node.js host for AETHER Core v1.0.0
// Extracts AETHER_CORE from index.html and binds Node.js capabilities.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ─── Extract AETHER_CORE from index.html ────────────────────
function extractCoreFromHTML() {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('❌ index.html not found. Please place this script in the same folder.');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    console.error('❌ No <script> block found in index.html');
    process.exit(1);
  }

  const sandbox = {
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    document: { addEventListener: () => {}, getElementById: () => null, createElement: () => ({ style: {}, appendChild: () => {} }) },
    window: { addEventListener: () => {}, location: { href: 'about:blank' }, navigator: { userAgent: 'Node.js' }, performance: { now: Date.now } },
    navigator: { userAgent: 'Node.js' },
    HTMLElement: function() {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    XMLHttpRequest: function() {},
    module: { exports: {} },
    exports: {},
    __dirname, __filename, require, global, process, Buffer
  };
  sandbox.AETHER_CORE = {};

  try {
    const script = new vm.Script(scriptMatch[1], { filename: 'index.html' });
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    const core = context.AETHER_CORE || sandbox.AETHER_CORE;
    if (!core || typeof core !== 'object') {
      console.error('❌ Failed to extract AETHER_CORE. Ensure it is defined globally.');
      process.exit(1);
    }
    console.log('✅ AETHER_CORE extracted from index.html');
    return core;
  } catch (e) {
    console.error('❌ Extraction error:', e.message);
    process.exit(1);
  }
}

let AETHER_CORE;
try {
  AETHER_CORE = require('./aether-core.js');
  console.log('✅ AETHER_CORE loaded from aether-core.js');
} catch (e) {
  AETHER_CORE = extractCoreFromHTML();
}

// ─── Bind Node.js capabilities ──────────────────────────────────
function bindNodeFS() {
  const bindings = {
    node_fs_read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
    node_fs_write: (p, c) => { try { fs.writeFileSync(p, c); return true; } catch (e) { return false; } },
    node_fs_exists: (p) => fs.existsSync(p),
    node_fs_stat: (p) => { try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs }; } catch (e) { return null; } },
    node_fs_list: (p) => { try { return fs.readdirSync(p || '.'); } catch (e) { return []; } },
    node_fs_mkdir: (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch (e) { return false; } },
    node_fetch: async (url) => { try { const res = await fetch(url); const text = await res.text(); return { ok: res.ok, status: res.status, text }; } catch (e) { return { ok: false, error: e.message }; } },
    node_fetch_binary: async (url) => { try { const res = await fetch(url); const buffer = await res.arrayBuffer(); return { ok: res.ok, status: res.status, bytes: Buffer.from(buffer) }; } catch (e) { return { ok: false, error: e.message }; } },
    node_cwd: () => process.cwd(),
    node_argv: () => process.argv.slice(2),
    node_env: (k) => process.env[k] || null,
    node_exit: (code) => process.exit(code || 0),
    node_sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  };

  for (const [name, fn] of Object.entries(bindings)) {
    AETHER_CORE.KERNEL.register(name, fn);
  }
  console.log('✅ Node.js bindings registered');
}

bindNodeFS();

// ─── Run script or REPL ─────────────────────────────────────────
function runScript(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Script not found: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  const result = AETHER_CORE.run(code);
  if (result.ok) {
    for (const line of result.output) console.log(line);
    if (result.result !== undefined && result.result !== null && result.output.length === 0)
      console.log('→', result.result);
    process.exit(0);
  } else {
    console.error('❌ Error:', result.error);
    for (const line of result.output) console.log(line);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('AETHER Host v1.0.0 — Node.js');
  console.log('Usage: node aether-host.js <script.ae>  or  node aether-host.js repl');
  process.exit(0);
}
if (args[0] === 'repl') {
  console.log('λ AETHER REPL v1.0.0 (Node.js)');
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('λ> ');
  rl.prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed === '.exit') { rl.close(); return; }
    const result = AETHER_CORE.run(line);
    if (result.ok) {
      for (const out of result.output) console.log(out);
      if (result.result !== undefined && result.result !== null && result.output.length === 0)
        console.log('→', result.result);
    } else console.log('✗', result.error);
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
} else {
  runScript(args[0]);
}
