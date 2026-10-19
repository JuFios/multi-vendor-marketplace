# Multi-Vendor Marketplace

A multi-vendor marketplace with real-time inventory.

This README is a placeholder; the full documentation is added later.

## Requirements

- Node.js 24+
- npm 11+

## Quick start

```bash
npm install
npm run dev -w apps/api          # HTTP API on http://localhost:3000/api/health
npm run dev:worker -w apps/api   # background worker
npm run dev -w apps/web          # web app on http://localhost:5173
```

## Checks

```bash
npm run lint && npm run typecheck && npm test && npm run test:e2e -w apps/api && npm run build
```
