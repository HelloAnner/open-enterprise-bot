# Open Enterprise Bot

A polished enterprise Bot workspace built with React, TypeScript, TanStack Query, Zustand, Radix UI, Motion, Lucide, dnd-kit, and Vite.

## Start locally

```bash
cd Frontend
npm install
npm run dev
```

## LAN / remote access

```bash
cd Frontend
npm run dev:remote
```

Open `http://mac-mini-1002:4173` on the local network, or replace that host with the machine's reachable hostname/IP.

## Project structure

- `Frontend/src/api` — typed API contracts, query hooks, and reusable HTTP mocks
- `Frontend/src/domain` — Bot, chat, and kanban domain models
- `Frontend/src/features` — product feature modules
- `Frontend/src/components` — shared UI components
- `Frontend/src/stores` — UI-only Zustand state
- `docs` — architecture documentation

See [Frontend/README.md](Frontend/README.md) for the data flow and real-backend configuration.

## Verify

```bash
cd Frontend
npm run build
npm test
```
