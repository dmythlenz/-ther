// aether-host.js — Node.js host for AETHER Core v1.0.0
// Extracts AETHER_CORE from index.html and binds Node.js capabilities.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function getFetchImplementation() {
  if (typeof fetch !== 'undefined') return fetch;
  try {
    // node-fetch v2 exports a function, v3 is ESM only — try require as best-effort
    return require('node-fetch');
  } catch (e) {
    return null;
  }
}

// ─── Extract AETHER_CORE from index.html ────────────────────
function extractCoreFromHTML() {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('❌ index.html not found. Please place this script in the same folder.');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  // If there is no <script> block, treat the entire file as the script source.
  const scriptSource = scriptMatch ? scriptMatch[1] : html;

  const fetchImpl = getFetchImplementation();
  const sandboxFetch = fetchImpl ? fetchImpl : (...args) => Promise.reject(new Error('fetch not available'));

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
    __dirname, __filename, require, global, process, Buffer,
    fetch: sandboxFetch,
  };
  sandbox.AETHER_CORE = {};

  try {
    const script = new vm.Script(scriptSource, { filename: 'index.html' });
    const context = vm.createContext(sandbox);
    script.runInContext(context);
    const core = context.AETHER_CORE || sandbox.AETHER_CORE || context.module && context.module.exports && context.module.exports.AETHER_CORE;
    if (!core || typeof core !== 'object') {
      console.error('❌ Failed to extract AETHER_CORE. Ensure it is defined globally in index.html or exported.');
      process.exit(1);
    }
    console.log('✅ AETHER_CORE extracted from index.html');
    return core;
  } catch (e) {
    console.error('❌ Extraction error:', e && e.message ? e.message : String(e));
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

// Sanity checks
if (!AETHER_CORE || typeof AETHER_CORE !== 'object') {
  console.error('❌ AETHER_CORE is not available or invalid.');
  process.exit(1);
}

function bindNodeFS() {
  const fetchImpl = getFetchImplementation();

  const bindings = {
    node_fs_read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
    node_fs_write: (p, c) => { try { fs.writeFileSync(p, c); return true; } catch (e) { return false; } },
    node_fs_exists: (p) => fs.existsSync(p),
    node_fs_stat: (p) => { try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs }; } catch (e) { return null; } },
    node_fs_list: (p) => { try { return fs.readdirSync(p || '.'); } catch (e) { return []; } },
    node_fs_mkdir: (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch (e) { return false; } },
    node_fetch: async (url, opts) => {
      if (!fetchImpl) return { ok: false, error: 'fetch not available in host' };
      try {
        const res = await fetchImpl(url, opts);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    },
    node_fetch_binary: async (url, opts) => {
      if (!fetchImpl) return { ok: false, error: 'fetch not available in host' };
      try {
        const res = await fetchImpl(url, opts);
        const buffer = await (res.arrayBuffer ? res.arrayBuffer() : res.buffer());
        return { ok: res.ok, status: res.status, bytes: Buffer.from(buffer) };
      } catch (e) {
        return { ok: false, error: e && e.message ? e.message : String(e) };
      }
    },
    node_cwd: () => process.cwd(),
    node_argv: () => process.argv.slice(2),
    node_env: (k) => process.env[k] || null,
    node_exit: (code) => process.exit(code || 0),
    node_sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  };

  if (AETHER_CORE && AETHER_CORE.KERNEL && typeof AETHER_CORE.KERNEL.register === 'function') {
    for (const [name, fn] of Object.entries(bindings)) {
      try {
        AETHER_CORE.KERNEL.register(name, fn);
      } catch (e) {
        console.warn(`⚠️ Failed to register binding ${name}:`, e && e.message ? e.message : String(e));
      }
    }
    console.log('✅ Node.js bindings registered');
  } else {
    console.warn('⚠️ AETHER_CORE.KERNEL.register not available — skipping Node bindings');
  }
}

bindNodeFS();

// ─── Run script or REPL ─────────────────────────────────────────
function runScript(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Script not found: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  if (!AETHER_CORE || typeof AETHER_CORE.run !== 'function') {
    console.error('❌ AETHER_CORE.run() is not available.');
    process.exit(1);
  }
  const result = AETHER_CORE.run(code);
  if (result && result.ok) {
    for (const line of result.output || []) console.log(line);
    if (result.result !== undefined && result.result !== null && (result.output || []).length === 0)
      console.log('→', result.result);
    process.exit(0);
  } else {
    console.error('❌ Error:', result && result.error ? result.error : 'unknown');
    for (const line of (result && result.output) || []) console.log(line);
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
  if (!AETHER_CORE || typeof AETHER_CORE.run !== 'function') {
    console.error('❌ AETHER_CORE.run() is not available for REPL.');
    process.exit(1);
  }
  console.log('λ AETHER REPL v1.0.0 (Node.js)');
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt('λ> ');
  rl.prompt();
  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (trimmed === '.exit') { rl.close(); return; }
    try {
      const result = AETHER_CORE.run(line);
      if (result && result.ok) {
        for (const out of result.output || []) console.log(out);
        if (result.result !== undefined && result.result !== null && (result.output || []).length === 0)
          console.log('→', result.result);
      } else {
        console.log('✗', result && result.error ? result.error : 'unknown error');
      }
    } catch (e) {
      console.log('✗', e && e.message ? e.message : String(e));
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
} else {
  runScript(args[0]);
}
