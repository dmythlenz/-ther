// ================================================================
// aether-host.js – Node.js Host for AETHER Core v1.0.0
// Standalone · Zero dependencies · Fully synchronous
// ================================================================

const fs = require('fs');
const http = require('http');
const https = require('https');
const url = require('url');

// ─── Load AETHER Core ──────────────────────────────────────────────
let AETHER_CORE;
try {
  AETHER_CORE = require('./aether-core.js');
  console.log('✅ AETHER_CORE loaded successfully.');
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

// ─── Synchronous HTTP GET (Node built-ins only) ──────────────────
function syncFetch(urlStr) {
  const parsed = url.parse(urlStr);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  let responseData = '';
  let statusCode = 0;
  let error = null;
  let finished = false;

  const req = lib.get({
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: parsed.path || '/',
    method: 'GET',
    headers: { 'User-Agent': 'AETHER/1.0' }
  }, (res) => {
    statusCode = res.statusCode;
    res.setEncoding('utf8');
    res.on('data', (chunk) => { responseData += chunk; });
    res.on('end', () => { finished = true; });
    res.on('error', (e) => { error = e.message; finished = true; });
  });

  req.on('error', (e) => { error = e.message; finished = true; });
  req.end();

  // Busy-wait with event loop yield
  while (!finished) {
    // Allow Node to process events
    require('child_process').spawnSync('node', ['-e', '']);
  }

  if (error) {
    return { ok: false, error: error };
  }
  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    text: responseData
  };
}

// ─── Synchronous Sleep ─────────────────────────────────────────────
function syncSleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Busy-wait
  }
  return true;
}

// ─── Register Node.js Bindings ────────────────────────────────────
function safeRegister(name, fn) {
  try {
    AETHER_CORE.KERNEL.register(name, fn);
  } catch (e) {
    console.warn(`⚠️  Failed to register ${name}:`, e.message);
  }
}

const bindings = {
  // Filesystem operations
  node_fs_read: (p) => {
    try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
  },
  node_fs_write: (p, c) => {
    try { fs.writeFileSync(p, c); return true; } catch (e) { return false; }
  },
  node_fs_exists: (p) => fs.existsSync(p),
  node_fs_stat: (p) => {
    try { const s = fs.statSync(p); return { size: s.size, mtime: s.mtimeMs }; } catch (e) { return null; }
  },
  node_fs_list: (p) => {
    try { return fs.readdirSync(p || '.'); } catch (e) { return []; }
  },
  node_fs_mkdir: (p) => {
    try { fs.mkdirSync(p, { recursive: true }); return true; } catch (e) { return false; }
  },

  // Network operations (synchronous)
  node_fetch: (urlStr) => syncFetch(urlStr),
  node_fetch_binary: (urlStr) => {
    const result = syncFetch(urlStr);
    if (!result.ok) return result;
    return { ok: true, status: result.status, bytes: Buffer.from(result.text, 'utf8') };
  },

  // Process / Environment
  node_cwd: () => process.cwd(),
  node_argv: () => process.argv.slice(2),
  node_env: (k) => process.env[k] || null,
  node_exit: (code) => process.exit(code || 0),

  // Utility
  node_sleep: (ms) => syncSleep(ms),
};

// Register all bindings
for (const [name, fn] of Object.entries(bindings)) {
  safeRegister(name, fn);
}
console.log('✅ Node.js bindings registered (synchronous, zero deps).');

// ─── Run Script or REPL ──────────────────────────────────────────
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
    if (result.result !== undefined && result.result !== null && result.output.length === 0) {
      console.log('→', result.result);
    }
    process.exit(0);
  } else {
    console.error('❌ Error:', result.error);
    for (const line of result.output) console.log(line);
    process.exit(1);
  }
}

function runRepl() {
  console.log('λ AETHER REPL v1.0.0 (Node.js)');
  console.log('Type .exit to quit');
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
      if (result.result !== undefined && result.result !== null && result.output.length === 0) {
        console.log('→', result.result);
      }
    } else {
      console.log('✗', result.error);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

// ─── Main Entry Point ────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  AETHER Host v1.0.0 — Zero Dependencies           ║');
  console.log('║  Standalone AETHER runtime for Node.js            ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Usage:');
  console.log('  node aether-host.js <script.ae>   Run an Aether script');
  console.log('  node aether-host.js repl          Start interactive REPL');
  console.log('');
  console.log('Examples:');
  console.log('  node aether-host.js convert.ae kimi-k3 moonshotai/Kimi-K3');
  console.log('  node aether-host.js repl');
  console.log('');
  process.exit(0);
}

if (args[0] === 'repl') {
  runRepl();
} else {
  runScript(args[0]);
}
