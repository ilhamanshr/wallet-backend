# Insignia Crypto Wallet — Backend

[![test](https://github.com/ilhamanshr/wallet-backend/actions/workflows/test.yml/badge.svg)](https://github.com/ilhamanshr/wallet-backend/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/ilhamanshr/wallet-backend/branch/main/graph/badge.svg)](https://codecov.io/gh/ilhamanshr/wallet-backend)

Production-grade backend for the **Insignia offline assignment**: a simple
crypto-wallet REST API built with **NestJS**, **Prisma**, and
**PostgreSQL**.

> **Live URL**: https://wallet-backend-production-c875.up.railway.app
>
> **Swagger UI**: https://wallet-backend-production-c875.up.railway.app/docs
>
> Spec: `Assignment.yml` (the OpenAPI 3.1 file shipped with the assignment).

---

## Highlights

- **Clean, feature-modular architecture** — `controller → service → repository → Prisma`. Each module is independently testable; services know nothing about HTTP.
- **Money-safe** — balances stored as `NUMERIC(38,18)` and manipulated via `Prisma.Decimal`. JS `number` is used **only** at the JSON boundary via a global response interceptor.
- **Concurrency-safe transfers** — every wallet mutation runs inside a Postgres `Serializable` transaction, with explicit `SELECT … FOR UPDATE` row locks. Transfers lock both wallets in deterministic order (`userId asc`) to eliminate deadlocks under simultaneous A→B and B→A traffic.
- **JWT auth** — accepts both raw (`Authorization: <token>`, per spec) and `Bearer` formats.
- **Global validation, error filter, and Decimal serializer** — DTOs are validated by `class-validator`; one filter normalizes every error response shape and translates Prisma uniqueness errors into 409.
- **Tests** — Jest unit suites for every service plus a Supertest e2e suite that runs the entire API against a real Postgres, including a concurrent-transfer no-double-spend test.
- **Deploy-ready** — multi-stage `Dockerfile` (node:20-slim + OpenSSL); `railway.json` uses `preDeployCommand` for migrations so the healthcheck only fires once the app is fully live.

---

## Project structure

```
.
├── prisma/
│   └── schema.prisma                 # User, Wallet, Transaction
├── src/
│   ├── main.ts                       # bootstrap
│   ├── app.module.ts
│   ├── config/configuration.ts       # typed env loader
│   ├── prisma/                       # global PrismaModule + service
│   ├── common/
│   │   ├── decorators/current-user.decorator.ts
│   │   ├── filters/all-exceptions.filter.ts
│   │   └── interceptors/decimal-serializer.interceptor.ts
│   ├── auth/                         # JWT strategy, guard, AuthService
│   ├── users/                        # POST /user
│   ├── wallets/                      # GET /balance, POST /topup
│   ├── transfers/                    # POST /transfer
│   ├── stats/
│   │   ├── dto/                      # response shapes (TopTransactionDto, TopUserDto)
│   │   └── ...                       # GET /top_transactions_per_user, /top_users
│   └── health/                       # GET /health (deploy probe)
├── test/
│   ├── setup.ts                      # boots the real Nest app for e2e
│   ├── wallet.e2e-spec.ts            # full-stack e2e against Postgres
│   └── jest-e2e.json
├── docker-compose.yml                # local Postgres
├── Dockerfile                        # multi-stage prod build
├── railway.json                      # Railway one-click config
├── .env.example
└── package.json
```

---

## Quick start (local)

### 1. Prerequisites

- Node.js 20+
- npm 10+
- Docker (for local Postgres)

### 2. Boot Postgres

```bash
docker compose up -d postgres
```

### 3. Install + generate Prisma client + apply migrations

```bash
cp .env.example .env
npm install
npx prisma migrate dev --name init
```

`prisma migrate dev` creates the SQL migration on first run and applies it.

### 4. Run

```bash
npm run start:dev
# → Wallet API listening on :3000
```

### 5. Smoke test

```bash
# 1. register two users
ALICE=$(curl -s -X POST localhost:3000/user -H 'Content-Type: application/json' \
  -d '{"username":"alice"}' | jq -r .token)
BOB=$(curl -s -X POST localhost:3000/user -H 'Content-Type: application/json' \
  -d '{"username":"bob"}' | jq -r .token)

# 2. topup alice
curl -s -X POST localhost:3000/topup -H "Authorization: $ALICE" \
  -H 'Content-Type: application/json' -d '{"amount":1000}' -o /dev/null -w '%{http_code}\n'

# 3. transfer
curl -s -X POST localhost:3000/transfer -H "Authorization: $ALICE" \
  -H 'Content-Type: application/json' -d '{"to_username":"bob","amount":250}' -o /dev/null -w '%{http_code}\n'

# 4. balances
curl -s localhost:3000/balance -H "Authorization: $ALICE"
curl -s localhost:3000/balance -H "Authorization: $BOB"

# 5. stats
curl -s localhost:3000/top_transactions_per_user -H "Authorization: $ALICE"
curl -s localhost:3000/top_users -H "Authorization: $ALICE"
```

---

## Environment

| Variable          | Required | Default       | Description                                         |
| ----------------- | :------: | ------------- | --------------------------------------------------- |
| `DATABASE_URL`    |    ✅    | —             | Postgres connection string                          |
| `JWT_SECRET`      |    ✅    | —             | Secret used to sign auth tokens                     |
| `JWT_EXPIRES_IN`  |          | `2592000` (30d) | Token lifetime in seconds                         |
| `PORT`            |          | `3000`        | HTTP port the API listens on                        |
| `TEST_DATABASE_URL` |        | —             | Override `DATABASE_URL` during e2e (optional)       |

---

## API reference

All endpoints obey the supplied `Assignment.yml` exactly.

| Method | Path                         | Auth | Status     | Source |
| ------ | ---------------------------- | :--: | ---------- | ------ |
| POST   | `/user`                      |  ❌  | 201 / 400 / 409 | [`users.controller.ts`](src/users/users.controller.ts) |
| GET    | `/balance`                   |  ✅  | 200 / 401  | [`wallets.controller.ts`](src/wallets/wallets.controller.ts) |
| POST   | `/topup`                     |  ✅  | 204 / 400 / 401 | [`wallets.controller.ts`](src/wallets/wallets.controller.ts) |
| POST   | `/transfer`                  |  ✅  | 204 / 400 / 401 / 404 | [`transfers.controller.ts`](src/transfers/transfers.controller.ts) |
| GET    | `/top_transactions_per_user` |  ✅  | 200 / 401  | [`stats.controller.ts`](src/stats/stats.controller.ts) |
| GET    | `/top_users`                 |  ✅  | 200 / 401  | [`stats.controller.ts`](src/stats/stats.controller.ts) |
| GET    | `/health`                    |  ❌  | 200        | [`health.controller.ts`](src/health/health.controller.ts) |
| GET    | `/docs`                      |  ❌  | 200        | Swagger UI (interactive API explorer) |

### Authentication

`POST /user` returns `{ token }`. Send it back as `Authorization: <token>` (matching the spec example) or `Authorization: Bearer <token>` — both are accepted.

---

## Tests

### Unit (mocked Prisma — no DB required)

```bash
npm test
npm run test:cov   # with coverage report
```

42 tests across 7 files:

- [`users.service.spec.ts`](src/users/users.service.spec.ts) — register happy path, P2002 → 409, error rethrows.
- [`wallets.service.spec.ts`](src/wallets/wallets.service.spec.ts) — balance read, topup debit + DEPOSIT row, 8-dp truncation, sub-precision rejection, `>= 10_000_000` strict rejection.
- [`transfers.service.spec.ts`](src/transfers/transfers.service.spec.ts) — happy path, 404 missing recipient, 400 self-transfer, 400 insufficient, full-balance boundary, 8-dp truncation, decimal precision retained.
- [`stats.service.spec.ts`](src/stats/stats.service.spec.ts) — debit sign flip, counterparty mapping, empty list, ordering preserved, top-users pass-through + empty + order.
- [`auth/jwt.strategy.spec.ts`](src/auth/jwt.strategy.spec.ts) — raw + Bearer header parsing, missing user → 401.
- [`common/filters/all-exceptions.filter.spec.ts`](src/common/filters/all-exceptions.filter.spec.ts) — HttpException pass-through, Prisma P2002 → 409, unknown error → 500 (no message leak), other Prisma codes → 500.
- [`common/interceptors/decimal-serializer.interceptor.spec.ts`](src/common/interceptors/decimal-serializer.interceptor.spec.ts) — top-level + nested + array Decimal → number, null/undefined preserved, primitives pass-through.

### End-to-end (real Postgres)

```bash
docker compose up -d postgres
npx prisma migrate deploy
npm run test:e2e
```

The e2e suite covers every endpoint, every error path, **and a concurrent-transfer test** that fires two competing transfers via `Promise.all` and asserts the wallet never goes negative.

---

## Design notes

### Why `Decimal(38, 18)` for money?

JavaScript `number` is a 64-bit float. `0.1 + 0.2 !== 0.3`. For a wallet that's catastrophic — the sum-of-debits stat or a transfer for `0.30000000000000004` would silently produce wrong balances. We store and manipulate amounts as `Prisma.Decimal` (Decimal.js under the hood) and only convert to `number` at the JSON boundary via [`DecimalSerializerInterceptor`](src/common/interceptors/decimal-serializer.interceptor.ts).

### Wallet precision (8 dp, BTC-style truncation)

Even with `Decimal` math internally, the API receives amounts as JSON `number` (per the OpenAPI spec) — so JSON.parse silently rounds anything past ~15 significant digits. To make storage predictable and avoid drift past that boundary, **every write rounds to 8 decimal places using `ROUND_DOWN` (truncation)** — the convention used by Bitcoin (1 satoshi). A side benefit: amounts like `0.0000000001` (sub-precision) truncate to zero and are rejected with 400 instead of writing useless zero-amount transactions.

We deliberately **do not** use `class-validator`'s `IsNumber({ maxDecimalPlaces })`. Internally it does `String(value).split('.')[1].length`, which crashes on values JS represents in scientific notation (e.g. `1e-10`). Precision is bounded by the service-level truncation and the DB column type instead.

### Why `Serializable` + `SELECT … FOR UPDATE`?

A naive transfer of "read balance → check → debit/credit" has a classic TOCTOU window. Two concurrent transfers from the same wallet could both pass the check and both succeed, taking the balance negative. We close the window two ways:

1. The whole transfer runs in `prisma.$transaction(..., { isolationLevel: Serializable })`.
2. We explicitly `SELECT … FOR UPDATE` on both wallet rows before reading their balances. Locks are taken in **deterministic order** (sorted `userId`) so concurrent A→B and B→A transfers can't deadlock.

The e2e suite has a concurrency test that proves this.

### Why JWT (not opaque DB tokens)?

Stateless: no DB lookup beyond the `validate()` user-existence check. The spec just calls it "token" — JWT satisfies that with no surprises and the `validate()` callback still confirms the user wasn't deleted out from under us.

### Why a separate Repository layer?

Two reasons:

1. **Tests** — services are pure business logic, easy to mock.
2. **Containment** — Prisma's surface area stops at the repo. If we ever swap ORM, only `*.repository.ts` files change.

### Why ETags are disabled

Express generates `ETag` headers by default and returns `304 Not Modified` when the response body is unchanged between requests. For a wallet API this is **incorrect behaviour** — a client that cached a balance of 0 would keep seeing 0 even after a topup until it forces a fresh request. We disable ETags globally in `main.ts`:

```ts
app.getHttpAdapter().getInstance().set('etag', false);
```

Every response always returns `200` with the current value.

### Port binding (`::` not `0.0.0.0`)

The server binds to `::` (Node's default when no hostname is passed to `app.listen`), which covers **both IPv4 and IPv6**. This is required for Railway's private networking — services communicate over `*.railway.internal` using IPv6 addresses. If you only bind to `0.0.0.0` (IPv4), internal service calls will silently fail.

### Schema choice: one Transaction table

Topups (`DEPOSIT`) and transfers (`TRANSFER`) live in the same table with a `type` discriminator. The amount is always positive; direction is encoded by `(fromUserId, toUserId)`. This makes the two stats queries trivial (one `WHERE type='TRANSFER'` is enough) and avoids cross-table joins for the user-history query.

---

## Deploy to Railway

1. Push this repo to GitHub.
2. Go to [railway.app](https://railway.app), **New Project → Deploy from GitHub repo**.
3. Railway auto-detects `Dockerfile` and `railway.json`.
4. Add a **Postgres** plugin; Railway will inject `DATABASE_URL` automatically.
5. Add an env var: `JWT_SECRET=<a long random string>`.
6. Deploy. Railway runs `preDeployCommand` (migrations) first, then starts the container with `node dist/main.js`.
7. Open the generated URL — `GET /health` should return `{"status":"ok"}`. Live at: https://wallet-backend-production-c875.up.railway.app
8. Paste the URL into the top of this README under **Live URL**.

---

## Scripts

| Script                 | Purpose                                            |
| ---------------------- | -------------------------------------------------- |
| `npm run start:dev`    | Watch mode, local development                      |
| `npm run start:prod`   | Run the compiled output (`dist/main.js`)           |
| `npm run build`        | Compile TypeScript to `dist/`                      |
| `npm test`             | Unit tests                                         |
| `npm run test:cov`     | Unit tests + coverage                              |
| `npm run test:e2e`     | End-to-end tests against Postgres                  |
| `npm run prisma:migrate` | Generate + apply a new migration (dev)           |
| `npm run prisma:deploy`  | Apply pending migrations (prod)                  |
| `npm run prisma:studio`  | Open Prisma Studio against the configured DB    |

---

## Commit history

The git log tells the story of how the solution was built — scoped commits per feature, in implementation order. Run `git log --oneline` to see the full timeline.
