# Vendored Hermes install scripts (Route 2)

Copies of upstream `scripts/install.sh` and `scripts/install.ps1` from
[NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent).

PingHermesAgent uses these **locally** so bootstrap and `install-backend.sh` do not
fetch `raw.githubusercontent.com`.

## Sync from upstream

```bash
./scripts/sync-vendor-install.sh
# or: ./scripts/sync-vendor-install.sh /path/to/hermes-agent
```

Updates `vendor/hermes-agent/scripts/` and `vendor/VERSION` (git HEAD of source).

## Note

The install scripts still `git clone` the Nous `hermes-agent` repo when building
the Python backend (unless you pre-install the backend). Route 2 only removes the
**install script download** dependency, not the backend source clone.

For fully offline portable use, pre-bake `data/hermes/hermes-agent/venv` (Route 1).
