# Multi-Vendor Marketplace

A multi-vendor marketplace with real-time inventory.

This README is a placeholder; the full documentation is added later.

## Requirements

- Node.js 24+
- pnpm 10+

## Quick start

```bash
pnpm install
pnpm --filter api dev          # HTTP API on http://localhost:3000/api/health
pnpm --filter api dev:worker   # background worker
pnpm --filter web dev          # web app on http://localhost:5173
```

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm --filter api test:e2e && pnpm build
```
