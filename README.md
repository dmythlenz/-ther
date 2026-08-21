# AETHER Pixel Farm

Automated pipeline to convert HuggingFace models into pixel shards (`.pix` / `.idx`) and distribute them via GitHub Releases.

## One‑Click Setup

1. **Fork/Clone this repository.**
2. **Create a Release** with tag `v1.0` (empty is fine).
3. **Edit `index.html`** – replace `YOUR_USERNAME` and `YOUR_REPO` with your GitHub details.
4. **Push to GitHub.**
5. **Trigger the Action:** go to Actions → "Pixel Builder (AETHER)" → Run workflow → enter `kimi-k3`.
6. **Open `index.html`** in your browser – it automatically mounts the shard from the GitHub CDN.

## File Descriptions

| File | Purpose |
| :--- | :--- |
| `index.html` | AETHER Core v1.0.0 with auto‑mount logic. |
| `aether-host.js` | Node.js host that extracts the core and binds filesystem/fetch. |
| `convert-k3.ae` | Aether script that downloads the index and builds binary shards. |
| `.github/workflows/build.yml` | GitHub Action to run the converter on demand. |
| `README.md` | This guide. |

## Manual Usage

```bash
# Run the converter locally (requires Node.js 18+)
node aether-host.js convert-k3.ae

# Interactive REPL
node aether-host.js repl
