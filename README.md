## File Descriptions
| File | Purpose |
| :--- | :--- |
| `index.html` | AETHER Core v1.0.0 with auto‑mount logic |
| `aether-core.js` | Full AETHER runtime (standalone) |
| `aether-host.js` | Node.js host with zero dependencies |
| `convert.ae` | Universal converter with retry logic |
| `models.txt` | List of models to convert (one per line) |
| `.github/workflows/build.yml` | GitHub Action for auto & manual triggers |
| `README.md` | This guide |

## Manual Usage
```bash
# Run the converter for a specific model
node aether-host.js convert.ae kimi-k3 moonshotai/Kimi-K3

# Or convert all models listed in models.txt
node aether-host.js convert.ae

# Interactive REPL
node aether-host.js repl
