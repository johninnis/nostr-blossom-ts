# @innis/nostr-blossom

[![CI](https://github.com/johninnis/nostr-blossom-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-blossom-ts/actions/workflows/ci.yml)

The [Blossom](https://github.com/hzrd149/blossom) media-server protocol: upload, list, delete, mirror, download, head, check, and report blobs against any Blossom-compatible server. SHA-256 content addressing, kind 24242 auth events, multi-server mirroring.

The lib is domain primitives plus pure use-case factories, with a single infrastructure adapter (`adaptSigner`). It depends only on:

- `@innis/nostr-core` — the `Signer` and `HttpClient` port types, kind constants, `Result`, NIP-98 `encodeAuthHeader`, and `computeSha256`.

It owns no state, performs no caching, and never reaches `globalThis.fetch`. The application wires up the deps; this lib provides the protocol behaviour.

## Install

```sh
deno add jsr:@innis/nostr-blossom
```

## Public surface

### Domain — `domain/`

- **Branded types**: `Sha256` (validated 64-char lowercase hex), `ServerUrl` (validated origin URL), plus `BlobDescriptor`, `AuthAction`, `ReportType`, `ListBlobsQuery`, `BlobHeaders`.
- **Constants**: `BLOSSOM_AUTH_EVENT_KIND` (24242), `REPORT_EVENT_KIND` (1984).
- **Constructors**: `createSha256(raw)`, `createServerUrl(raw)` — return `Result<T, ValidationError>`. `computeSha256(buffer)` — content hashing, returns `Result<Sha256, ValidationError>` (it reuses `createSha256` for the branding, so there is one validation path).
- **Parsers**: `parseBlobDescriptor(value)` / `parseBlobDescriptorList(value)` — the single `unknown → Result<BlobDescriptor…>` validation, reused by every use-case that reads a JSON body. The descriptor's `sha256` is branded and lowercase-normalised through the same `createSha256` path, so a parsed `BlobDescriptor.sha256` is a ready-to-use `Sha256` (pass it straight to `delete`/`get`/`head`); a non-hex hash fails the parse. A BUD-08 `nip94` field, when the server sends one, is parsed to `@innis/nostr-core`'s `FileMetadata` and carried on `BlobDescriptor.nip94` (dimensions, blurhash, original hash).
- **`parseServerList(tags)`** — reads a user's BUD-03 server list (the `server` tags of a kind-10063 `KIND_BLOSSOM_SERVER_LIST` event) into preference-ordered, validated `ServerUrl`s. Invalid origins are skipped and duplicate origins collapsed. The single validated path from a server-list event to a usable server list — don't read the tags by hand.
- **Errors**: `BlossomError = SigningError | ServerError | ValidationError | NetworkError` — every member extends `@innis/nostr-core`'s `TaggedError`, so all carry a `tag` discriminant.
- **`createUnsignedAuthEvent({ action, content, expiration?, createdAt?, hashes? })`** — builds the kind 24242 template (action `t` tag, NIP-40 `expiration`, optional `x` hash tags). `createdAt` defaults to the system clock; pin it for deterministic output. Caller signs via `BlossomSigner.sign`.
- **`createUnsignedReportEvent({ sha256, reportType, reason })`** — builds the kind 1984 NIP-56 report template (`["x", <sha256>, <reportType>]`).
- **`buildListQueryString(query)`** — URL-encodes `ListBlobsQuery` (cursor, limit, since, until).
- **`buildBlobUrl(serverUrl, sha256, extension?)`** — the BUD-01 URL a blob is served from (`<origin>/<sha256>[.<ext>]`).
- **`extractSha256FromUrl(url)`** — the reverse: reads the `Sha256` out of a blob URL (the last 64-hex path segment, per BUD-03's rule for finding a blob's hash so it can be fetched elsewhere). Returns `Result<Sha256, ValidationError>` — the single validated URL → hash path.
- **`buildFallbackUrls(url, servers)`** — the ordered, deduplicated candidate URLs a blob may be fetched from: the original URL, its origin's flat BUD-01 URL, then each of the user's servers, preserving the file extension. A URL addressing no hash gets no alternatives.

### Ports — `application/ports.ts`

```ts
interface BlossomSigner {
    readonly sign: (event: UnsignedEvent) => Promise<Result<NostrEvent, SigningError>>
}

interface BlossomDeps {
    readonly signer: BlossomSigner
    readonly httpClient: HttpClient
}
```

`BlossomSigner` is the lib's `Result`-returning signing port — narrower than `@innis/nostr-core`'s exception-throwing `Signer`, so the application/domain layers stay catch-free (enforced by the `no-catch-in-layer` lint rule). The lib ships the adapter, so you never hand-write the conversion:

```ts
import { adaptSigner } from "@innis/nostr-blossom"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"

const signer = adaptSigner(createLocalSigner(generateSecretKey()))
```

`adaptSigner` is the lib's only infrastructure: it is the single boundary that turns a thrown `Signer` error into a `Failure(SigningError)`.

`HttpClient` is `@innis/nostr-core`'s transport port. Use its shipped default rather than rolling your own:

```ts
import { createHttpClient } from "@innis/nostr-core"

const httpClient = createHttpClient()
```

Its contract is what makes the use-cases correct: **HTTP status `>= 400` → `Failure(ServerError)`** (with the server's `x-reason`/body as the message), transport faults → `Failure(NetworkError)`, `< 400` → `Success`. The use-cases rely on that — a hand-rolled client that returns success for a 4xx would make `delete`/`check`/`report` silently report success. For tests, an in-memory `HttpClient` mirroring that contract keeps the lib runnable in Deno, browsers, Workers, and CI with no network.

### Use-case factories — `application/`

Each takes `BlossomDeps` and returns a function `(input) => Promise<Result<T, BlossomError>>`. Every input accepts optional `timeoutMs` / `signal` abort controls, forwarded verbatim to the `HttpClient` (`timeoutMs` caps the headers exchange; `signal` aborts the in-flight call):

- **`createUpload`** — `PUT /upload` (or `PUT /media` when `input.endpoint === "media"`, Blossom's image-transform endpoint). Hashes the file, signs an `upload`/`media` auth event, returns `BlobDescriptor`.
- **`createListBlobs`** — `GET /list/<pubkey>`. Returns `ReadonlyArray<BlobDescriptor>`.
- **`createDeleteBlob`** — `DELETE /<sha256>`. Auth-action `delete`.
- **`createMirrorBlob`** — `PUT /mirror`. Body is `{ url }`; the server fetches and stores. Auth-action `upload` (BUD-04).
- **`createGetBlob`** — `GET /<sha256>`. Returns the body as a `Blob` plus its content type. Auth-action `get`. With `verify: true` the body is hashed and compared to the requested `sha256`; a corrupt or lying server becomes a `ValidationError` failure instead of bad bytes.
- **`createHeadBlob`** — `HEAD /<sha256>`. Returns `BlobHeaders` (`contentType`, `contentLength`). Auth-action `get`.
- **`createCheckUpload`** — `HEAD /upload` (BUD-06). Asks "would this upload succeed?" before sending the body, via `X-SHA-256`/`X-Content-Length`/`X-Content-Type` headers.
- **`createReportBlob`** — `PUT /report`. Signs a kind 1984 NIP-56 report referencing the blob's sha256 and sends it as the request body. Per BUD-09 this endpoint takes **no** kind-24242 auth header. It is a server-side report; it does not propagate over Nostr unless the operator forwards it.

### Multi-server orchestration — `application/`

A user's BUD-03 server list is an ordered fallback chain, and every consumer otherwise rewrites the same loops over it. These factories are those loops, done once, composed from the single-server use-cases above (same `BlossomDeps`, same abort controls):

- **`createListBlobsAcrossServers`** — lists the pubkey's blobs on every server concurrently and streams a `ListAcrossServersUpdate` to `onUpdate` as each server replies, never waiting for the slowest. Blobs are merged by hash with the servers each is present on; `respondedServers` / `failedServers` tell you which absences are meaningful. Returns a handle whose `abort()` cancels the in-flight requests — call it on teardown.
- **`createUploadWithMirrors`** — uploads to the first server, then asks the rest to mirror, concurrently. Only the primary upload decides success; per-mirror outcomes are reported in the result for the caller to surface or retry.
- **`createMirrorToServers`** — asks every server to mirror an existing blob, concurrently, resolving to a `ServerOutcome` per server. (`createUploadWithMirrors` composes this.)
- **`createGetBlobWithFallback`** — tries each server in preference order until one returns the blob. Every response is verified against the requested hash — a lying server counts as a failure and the chain moves on — so the resolved blob is guaranteed to be the content you addressed.

**Why `get`/`head` authenticate.** BUD-01 makes the `get` auth event *optional* — public blobs need none. This library authenticates anyway, because its job is managing **your own** storage: fetching private blobs, or reading from servers that gate downloads per-pubkey. A signed `get` event is the superset that works in every case (servers that don't require auth ignore it). If you only ever need anonymous public reads, you don't need this library — fetch the blob URL directly.

### Internal — `application/authorised-request.ts`

`createAuthorisedRequest(deps)` is the single boundary that:

1. Builds the unsigned kind 24242 auth event.
2. Signs it via `BlossomSigner.sign` (returning `Failure` on signing failure).
3. Encodes `Authorization: Nostr <base64>` via `encodeAuthHeader`.
4. Calls `HttpClient.request(...)`.

Every authenticated use-case goes through this. Non-2xx / transport mapping is the injected `HttpClient`'s job (see its contract above), so a use-case only ever branches on a single `if (!response.success)`. Bodies are then parsed through `parseJsonResponse` + the domain parsers — one path, no per-use-case JSON validation.

## Wiring

The library ships no wiring of its own — the consumer assembles `BlossomDeps` once and feeds it to whichever use-case factories it needs:

```ts
import { adaptSigner, createUpload } from "@innis/nostr-blossom"
import { createHttpClient, createLocalSigner, generateSecretKey } from "@innis/nostr-core"

const deps = {
  signer: adaptSigner(createLocalSigner(generateSecretKey())),
  httpClient: createHttpClient(),
}

const upload = createUpload(deps)
const result = await upload({ serverUrl, file })
```

`deps` is reusable across every factory (`createListBlobs(deps)`, `createDeleteBlob(deps)`, …) — build it once.

## Testing

`@innis/nostr-blossom/testing` ships an in-memory Blossom network implementing the `HttpClient` port, so hosts drive the real use-cases against conformant BUD behaviour — auth-event checking, content addressing, cross-server mirroring — with no socket and no mocks of the lib itself:

```ts
import { createInMemoryBlossomNetwork } from "@innis/nostr-blossom/testing"

const network = createInMemoryBlossomNetwork()
const server = network.createServer("https://one.example.com")
const deps = { signer, httpClient: network.httpClient }

await server.seedBlob({ data, pubkey })     // arrange state directly
server.setUnreachable(true)                 // simulate a dead server
server.getStoredBlobs()                     // assert what the server holds
```

`seedBlob` accepts a `sha256` override that makes the server lie about a blob's content — seed with it to exercise integrity verification.

## Anti-patterns

- **Calling `fetch` inside this lib.** Always inject `HttpClient`.
- **Hand-rolling an `HttpClient` that returns success for `>= 400`.** Use `@innis/nostr-core`'s `createHttpClient()` or mirror its contract exactly.
- **Bypassing `createAuthorisedRequest`** for an authenticated call. The auth header / signing logic is centralised.
- **Catching in a use-case.** The signing boundary is `adaptSigner`; everything else is `Result`-typed already.
- **Trusting unvalidated `Sha256` / `ServerUrl` inputs.** Use `createSha256` / `createServerUrl` and let the `Result` carry the failure. Don't cast.
- **Confusing `createReportBlob` with a Nostr-relay publish.** It posts to the Blossom server's `/report` endpoint, not to a relay.
