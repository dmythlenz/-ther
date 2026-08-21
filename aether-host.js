// aether-host.js – Node.js host with full error handling
const fs = require('fs');
const path = require('path');

let AETHER_CORE;
try {
  AETHER_CORE = require('./aether-core.js');
  console.log('✅ AETHER_CORE loaded.');
} catch (e) {
  console.error('❌ Failed to load aether-core.js:', e.message);
  console.error('   Please ensure aether-core.js exists in the same folder.');
  process.exit(1);
}

// Ensure KERNEL exists
if (!AETHER_CORE.KERNEL) {
  console.warn('⚠️  KERNEL missing, creating stub.');
  AETHER_CORE.KERNEL = { register: () => {}, call: () => {} };
}

// ─── Register Node.js bindings ──────────────────────────────────
function safeRegister(name, fn) {
  try {
    AETHER_CORE.KERNEL.register(name, fn);
  } catch (e) {
    console.warn(`⚠️  Failed to register ${name}:`, e.message);
  }
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
  safeRegister(name, fn);
}
console.log('✅ Node.js bindings registered.');

// ─── Run Script or REPL ─────────────────────────────────────────
function runScript(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Script not found: ${filePath}`);
    process.exit(1);
  }
  const code = fs.readFileSync(filePath, 'utf8');
  if (typeof AETHER_CORE.run !== 'function') {
    console.error('❌ AETHER_CORE.run is not a function.');
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
