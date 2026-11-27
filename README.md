# دفتر — Daftar

> A ledger that never loses a sale, even when the internet dies mid-transaction.

Egypt has ~3 million micro-retailers running their accounts on a paper notebook (دفتر).
Every shop app assumes connectivity at the exact moment of the sale — and fails.
**Daftar treats the device as the source of truth and the network as an optional background luxury.**

## The demo that sells the project

Open the app, kill Wi-Fi, ring up sales and a customer debt. Everything works — instantly.
Close the tab, reopen it — still there. Turn Wi-Fi back on and watch the outbox drain.
Open the same shop on a second phone, edit a different field of the same customer,
and watch the two edits **merge** instead of one silently deleting the other.

## Architecture

```
┌──────────────────────────── device (source of truth) ──────────────────────────┐
│  React + TS UI                                                                  │
│      │  write                                                                    │
│      ▼                                                                           │
│  local replica (IndexedDB)  ──►  outbox (durable queue, UUID per mutation)      │
│                                      │                                            │
│                                      ▼  flush when online, backoff + jitter     │
│                              ┌──────────────────┐                              │
│                              │  worker / interval│ ──── POST /rpc ────┐        │
│                              └──────────────────┘                    │        │
└──────────────────────────────────────────────────────────────────────┼─────────┘
                                                                        ▼
                                             Supabase (Postgres + RLS + idempotency keys)
```

## The three ideas that carry the project

1. **Idempotency by construction.** Every mutation is minted with a UUID on the device.
   A retry after a timeout carries the same key and `apply_mutation` applies it once.
   No duplicate sales. Ever.
2. **Backoff with jitter.** A shop with two phones shouldn't hammer the same endpoint in lockstep.
3. **Field-level merge, not row-level.** Two concurrent edits to the same customer end up with **both** changes.

## Run

```bash
npm install
npm test          # 45 unit/integration tests
npm run dev       # dev server
npm run test:e2e  # Playwright offline demo (needs a browser installed)
```

## Configure the backend (optional)

The app is fully functional offline with no backend. To enable real sync, copy `.env.example`
to `.env` and set the Supabase anon/publishable key. **The service_role key never belongs in the client bundle.**

## Non-negotiables

- The offline demo is a Playwright test (`tests/offlineDemo.spec.ts`), not a README claim.
- No `service_role` key anywhere near the client bundle.
- Every table has RLS with a test proving shop A can't read shop B.
- Money is stored in integer piastres, never floats.
- Timestamps are server-authoritative for ordering; the device clock is never trusted.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation, design system, types | ✅ |
| 2 | Outbox (durable queue, backoff+jitter, dead letters) | ✅ |
| 3 | Field-level conflict merge | ✅ |
| 4 | Local replica (IndexedDB) | ✅ |
| 5 | Offline-first sale flow | ✅ |
| 6 | Supabase schema + apply_mutation RPC + RLS | ✅ |
| 7 | Debt book + WhatsApp reminder | ✅ |
| 8 | Daily close | ✅ |
| 9 | Two-device merge demo | ✅ |
| 10 | Playwright offline demo + delivery | ✅ |

## Scope — v1

**In:** sales, returns, customer debts, daily cash summary, offline queue with backoff, field-level merge,
WhatsApp debt reminder, Arabic-first RTL.

**Out (deliberately):** inventory, suppliers, invoicing/tax, realtime collaboration, full CRDT, SMS/push, desktop.
One shop, one device, one person.
