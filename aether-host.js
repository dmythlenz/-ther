// aether-host.js — Node.js host (safe extraction with regex)
const fs = require('fs');
const path = require('path');

function extractCoreFromHTML() {
  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('❌ index.html not found. Place this script in the same folder.');
    process.exit(1);
  }

  const html = fs.readFileSync(htmlPath, 'utf8');

  // Extract the main script block
  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!scriptMatch) {
    console.error('❌ No <script> tag found in index.html');
    process.exit(1);
  }

  const scriptContent = scriptMatch[1];

  // Use regex to extract the AETHER_CORE object definition
  // Find "const AETHER_CORE = {" and capture until the matching "};"
  // We do a simple balanced brace search to handle nested objects.
  const coreStart = scriptContent.indexOf('const AETHER_CORE = {');
  if (coreStart === -1) {
    console.error('❌ Could not find "const AETHER_CORE = {" in script.');
    process.exit(1);
  }

  let braceCount = 0;
  let endPos = coreStart;
  const startObj = scriptContent.indexOf('{', coreStart);
  if (startObj === -1) {
    console.error('❌ Could not find opening brace for AETHER_CORE');
    process.exit(1);
  }

  for (let i = startObj; i < scriptContent.length; i++) {
    if (scriptContent[i] === '{') braceCount++;
    if (scriptContent[i] === '}') braceCount--;
    if (braceCount === 0) {
      endPos = i + 1;
      break;
    }
  }

  if (braceCount !== 0) {
    console.error('❌ Unbalanced braces while extracting AETHER_CORE');
    process.exit(1);
  }

  const coreDefinition = scriptContent.substring(coreStart, endPos);

  // Evaluate the extracted definition in a clean Node context
  try {
    // Create a sandbox with basic globals
    const sandbox = {
      console: console,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
      setInterval: setInterval,
      clearInterval: clearInterval,
      Buffer: Buffer,
      process: process,
      global: global,
      // Mock browser objects that might be referenced inside the definition
      window: {},
      document: {
        addEventListener: () => {},
        getElementById: () => null,
        createElement: () => ({ style: {}, appendChild: () => {} }),
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { appendChild: () => {} }
      },
      navigator: { userAgent: 'Node.js' },
      HTMLElement: function() {},
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      XMLHttpRequest: function() {},
      // Expose the core variable so the eval can assign to it
      AETHER_CORE: {}
    };

    // Run the extracted definition in the sandbox
    const fn = new Function(
      ...Object.keys(sandbox),
      `"use strict"; ${coreDefinition}; return AETHER_CORE;`
    );
    const core = fn(...Object.values(sandbox));

    if (!core || typeof core !== 'object') {
      console.error('❌ Extraction returned invalid object');
      process.exit(1);
    }

    console.log('✅ AETHER_CORE extracted from index.html');
    console.log(`   Version: ${core.version || 'unknown'}`);
    console.log(`   Host: ${core.host || 'unknown'}`);
    return core;
  } catch (e) {
    console.error('❌ Error evaluating extracted AETHER_CORE:', e.message);
    console.error('   The extracted definition may be invalid.');
    process.exit(1);
  }
}

// ─── Load Core ───────────────────────────────────────────────────
let AETHER_CORE;
try {
  AETHER_CORE = require('./aether-core.js');
  console.log('✅ AETHER_CORE loaded from aether-core.js');
} catch (e) {
  AETHER_CORE = extractCoreFromHTML();
}

// ─── Bind Node.js capabilities ──────────────────────────────────
function safeRegister(kernel, name, fn) {
  if (kernel && typeof kernel.register === 'function') {
    kernel.register(name, fn);
  } else {
    console.warn(`⚠️  KERNEL not ready, skipping registration for ${name}`);
  }
}

function bindNodeFS() {
  if (!AETHER_CORE.KERNEL) {
    console.warn('⚠️  AETHER_CORE.KERNEL missing, creating stub.');
    AETHER_CORE.KERNEL = { register: () => {}, list: () => [], call: () => {} };
  }

  const bindings = {
    node_fs_read: (p) => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } },
    node_fs_write: (p, c) => { try { fs.writeFileSync(p, c); return true; } catch (e) { return false; } },
    node_fs_exists: (p) => fs.existsSync(p),
    node_fs_stat: (p) => { try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs }; } catch (e) { return null; } },
    node_fs_list: (p) => { try { return fs.readdirSync(p || '.'); } catch (e) { return []; } },
    node_fs_mkdir: (p) => { try { fs.mkdirSync(p, { recursive: true }); return true; } catch (e) { return false; } },
    node_fetch: async (url) => {
      try {
        const f = global.fetch || (await import('node-fetch')).default;
        if (!f) throw new Error('No fetch implementation');
        const res = await f(url);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    node_fetch_binary: async (url) => {
      try {
        const f = global.fetch || (await import('node-fetch')).default;
        if (!f) throw new Error('No fetch implementation');
        const res = await f(url);
        const buffer = await res.arrayBuffer();
        return { ok: res.ok, status: res.status, bytes: Buffer.from(buffer) };
      } catch (e) { return { ok: false, error: e.message }; }
    },
    node_cwd: () => process.cwd(),
    node_argv: () => process.argv.slice(2),
    node_env: (k) => process.env[k] || null,
    node_exit: (code) => process.exit(code || 0),
    node_sleep: (ms) => new Promise(r => setTimeout(r, ms)),
  };

  for (const [name, fn] of Object.entries(bindings)) {
    safeRegister(AETHER_CORE.KERNEL, name, fn);
  }
  console.log('✅ Node.js bindings registered');
}

bindNodeFS();

// ─── Run Script or REPL ─────────────────────────────────────────
function runScript(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Script not found: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf8');

  if (typeof AETHER_CORE.run !== 'function') {
    console.error('❌ AETHER_CORE.run is not a function. Check core extraction.');
    process.exit(1);
  }

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
