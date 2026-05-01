# SDK Adoption Migration

## Why

`invariance-mcp/src/lib/client.ts` (124 LOC) hand-rolls an HTTP wrapper with retry/backoff that duplicates `@invariance/sdk`. The SDK is healthier and the MCP server should consume it.

## Status

Deferred — needs per-tool-group migration with test verification at each step.

## Mapping

The 8 modern tool groups in `src/tools/*.ts` each call a small set of `InvarianceClient` methods (`get`, `post`, etc.). Replace with `client.<resource>.<method>()` calls per the same table in `invariance-cli/MIGRATION.md`.

The `legacy aliases` block in `src/server.ts` makes raw `client.get()` / `client.post()` calls — these can route to SDK calls too once aliases are removed in `0.3.0`.

## Order

1. Add `@invariance/sdk` as a dependency.
2. Replace transport: `src/lib/client.ts` becomes a thin re-export of `Invariance.init({ apiKey, apiUrl })` plus error-shape adapters.
3. Migrate tool groups one at a time: `runs` → `nodes` → `monitors` → `signals` → `findings` → `reviews` → `agents` → `insights`.
4. Drop the local retry/timeout logic — the SDK already handles both.
5. Once all groups are migrated and legacy aliases are removed in `0.3.0`, delete `src/lib/client.ts`.

## Risk notes

- The MCP server doesn't validate response shapes today (raw JSON pass-through). The SDK adds Zod parsing — make sure tool result payloads still match what MCP clients expect.
- Retry/backoff currently lives in MCP's client (`requestWithRetry`). Once the SDK takes over, configure `HttpClientOptions.retry` to preserve current behavior (max retries, base/max delay).
