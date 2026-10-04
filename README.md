# @innis/nostr-blossom

[![CI](https://github.com/johninnis/nostr-blossom-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/johninnis/nostr-blossom-ts/actions/workflows/ci.yml)

The [Blossom](https://github.com/hzrd149/blossom) media-server protocol: upload, list, delete, mirror, download, head, check, and report blobs against any Blossom-compatible server. SHA-256 content addressing, kind 24242 auth events, multi-server mirroring.

The lib is domain primitives plus pure use-case factories. It depends only on:

- `@innis/nostr-core` — the `Signer` and `HttpClient` port types, `Result`, the BUD-11 header writer `encodeBlossomAuthHeader`, the event, tag and NIP-94 helpers, and `sha256Hex`.

It owns no state, performs no caching, and never reaches `globalThis.fetch`. The application wires up the deps; this lib provides the protocol behaviour.

## Install

```sh
deno add jsr:@innis/nostr-blossom
```

## Public surface

### Domain — `domain/`

- **Branded types**: `Sha256` (validated 64-char lowercase hex), `ServerUrl` (validated origin URL), plus `BlobDescriptor`, `AuthAction`, `UploadEndpoint` (`"upload" | "media"`), `ReportType`, `ListBlobsQuery`, `BlobHeaders`.
- **Constants**: `BLOSSOM_AUTH_EXPIRATION_SECONDS` (3600, a token's default lifetime). The event kinds are `@innis/nostr-core`'s `KIND_BLOSSOM_AUTHORISATION` (24242) and `KIND_REPORTING` (1984).
- **Constructors**: `createSha256(raw)`, `createServerUrl(raw)` — return the branded value, or `null` for input that is not one. `computeSha256(buffer)` — synchronous content hashing, returns a `Sha256` (it reuses `createSha256` for the branding, so there is one validation path, and throws only if the digest were somehow not a hash — a broken invariant, never an input failure).
- **Parsers**: `parseBlobDescriptor(value)` / `parseBlobDescriptorList(value)` — the single `unknown → BlobDescriptor | null` validation (a list is `null` if it is not an array or any element is malformed), reused by every use-case that reads a JSON body — a body that is not JSON, or that the parser rejects, becomes a `ValidationFailure`. The descriptor's `sha256` is branded and lowercase-normalised through the same `createSha256` path, so a parsed `BlobDescriptor.sha256` is a ready-to-use `Sha256` (pass it straight to `delete`/`get`/`head`); a non-hex hash yields `null`. A BUD-08 `nip94` field, when the server sends one, is parsed to `@innis/nostr-core`'s `FileMetadata` and carried on `BlobDescriptor.nip94` (dimensions, blurhash, original hash).
- **`parseServerList(tags)`** — reads a user's BUD-03 server list (the `server` tags of a kind-10063 `KIND_BLOSSOM_SERVER_LIST` event) into preference-ordered, validated `ServerUrl`s. Invalid origins are skipped and duplicate origins collapsed. The single validated path from a server-list event to a usable server list — don't read the tags by hand.
- **`addServerTag(tags, serverUrl)`** / **`removeServerTag(tags, serverUrl)`** — the write side of the same list: append a `server` tag unless one already names the server, or drop every tag that does. A tag names the server when it normalises through `createServerUrl` to the same origin (so `https://Media.Example/` matches `https://media.example`), exactly as `parseServerList` reads it. Each returns `tags` itself — the same reference — when there is nothing to change, so a caller can tell a no-op apart without comparing contents.
- **Failures** — `failure/blossom-failure.ts`: `BlossomFailure = SignerFailure | ServerFailure | ValidationFailure | NetworkFailure`, plain data discriminated by `type` (the signer's own modes such as `"rejected"` or `"sign-failed"`, then `"server"`, `"validation"`, `"network"`), each with a `message`; `ServerFailure` also carries `status`. `SignerFailure`, `ServerFailure` and `NetworkFailure` come from `@innis/nostr-core`; `ValidationFailure` is local to this package.
- **`createUnsignedAuthEvent({ action, content, expiration?, createdAt?, hashes?, server? })`** — builds the BUD-11 kind 24242 template: the action `t` tag, a NIP-40 `expiration` (`BLOSSOM_AUTH_EXPIRATION_SECONDS` after `createdAt` unless given), an `x` tag per hash, and, given a `server`, a `server` tag holding its domain so the token is valid there alone. `createdAt` defaults to the system clock; pin it for deterministic output. Caller signs via `BlossomSigner.signEvent`.
- **`createUnsignedReportEvent({ sha256, reportType, reason })`** — builds the kind 1984 NIP-56 report template (`["x", <sha256>, <reportType>]`).
- **`buildListQueryString(query)`** — URL-encodes `ListBlobsQuery` (cursor, limit, since, until).
- **`buildBlobUrl(serverUrl, sha256, extension?)`** — the BUD-01 URL a blob is served from (`<origin>/<sha256>[.<ext>]`).
- **`extractSha256FromUrl(url)`** — the reverse: reads the `Sha256` out of a blob URL (the last 64-hex path segment, per BUD-03's rule for finding a blob's hash so it can be fetched elsewhere). Returns the `Sha256`, or `null` when no path segment carries a hash — the single validated URL → hash path.
- **`buildFallbackUrls(url, servers)`** — the ordered, deduplicated candidate URLs a blob may be fetched from: the original URL, its origin's flat BUD-01 URL, then each of the user's servers, preserving the file extension. A URL addressing no hash gets no alternatives.

### Ports — `application/ports.ts`

```ts
type BlossomSigner = Pick<Signer, "signEvent">

interface BlossomDeps {
    readonly signer: BlossomSigner
    readonly httpClient: HttpClient
}
```

`BlossomSigner` is the one `Signer` capability the use-cases need, so any `@innis/nostr-core` `Signer` — local, NIP-07 or NIP-46 — is passed in as it is. `signEvent` already returns a `Result`, and a `SignerFailure` it returns is passed through as the use-case's `BlossomFailure`, so a decline stays `rejected`.

`HttpClient` is `@innis/nostr-core`'s transport port. Use its shipped default rather than rolling your own:

```ts
import { createHttpClient } from "@innis/nostr-core"

const httpClient = createHttpClient()
```

Its contract is what makes the use-cases correct: **HTTP status `>= 400` → `Failure(ServerFailure)`** (with the server's `x-reason`/body as the message), a redirect → `Failure(ServerFailure)` unless the request asks to follow it, transport faults → `Failure(NetworkFailure)`, 2xx → `Success`. The use-cases rely on that — a hand-rolled client that returns success for a 4xx would make `delete`/`check`/`report` silently report success. For tests, an in-memory `HttpClient` mirroring that contract keeps the lib runnable in Deno, browsers, Workers, and CI with no network.

**Request policy.** Each request sets the client's per-request policy for what it fetches:

- A server at a private, loopback or link-local address or `localhost` is reached exactly when the `HttpClient` in `BlossomDeps` reaches one. Only the host knows whose server a URL names: signing for a server does not make it yours, since `createGetBlob` and `createHeadBlob` sign for any server a blob is fetched from, including another user's BUD-03 servers. Build the use-cases for the user's own storage, such as a server on their own list that sits on `localhost` or their LAN, with a client from `createHttpClient("allow-private")`, and those for servers someone else named with the default refusing client.
- `createGetBlob` and `createHeadBlob` follow a redirect only to a URL carrying the same sha256 — BUD-01: "If the endpoint returns a redirection 3xx status code such as 307 or 308 […], it MUST redirect to a URL containing the same sha256 hash as the requested blob." Every other request refuses redirects.
- `createGetBlob` caps the body at `expectedSize` when you know the blob's size (a `BlobDescriptor`'s `size`), else at `DEFAULT_MAX_BLOB_BYTES` (256 MiB). Every other request reads JSON or nothing, and keeps the client's default ceiling.

### Use-case factories — `application/`

Each takes `BlossomDeps` and returns a function `(input) => Promise<Result<T, BlossomFailure>>`. Every input accepts an optional `signal`, forwarded verbatim to the `HttpClient`, which aborts the in-flight call; a deadline is a signal too (`AbortSignal.timeout(ms)`):

- **`createUpload`** — `PUT /upload` (or `PUT /media` when `input.endpoint === "media"`, Blossom's image-transform endpoint). Hashes the file, signs an `upload`/`media` auth event, returns `BlobDescriptor`. With `check: true` it first runs the endpoint's pre-flight (below) with the hash it already computed: a `rejected` verdict fails with a `ServerFailure` carrying the server's status and reason before any bytes are sent; an `unsupported` verdict is not a failure, and the upload proceeds and decides.
- **`createListBlobs`** — `GET /list/<pubkey>` (BUD-12). Returns `ReadonlyArray<BlobDescriptor>`, newest first; page with `cursor` (the last blob's `sha256`) and `limit`. BUD-12 calls the endpoint optional and unrecommended, so expect some servers to refuse it.
- **`createDeleteBlob`** — `DELETE /<sha256>` (BUD-12). Auth-action `delete`.
- **`createMirrorBlob`** — `PUT /mirror`. Body is `{ url }`; the server fetches and stores. Auth-action `upload` (BUD-04).
- **`createGetBlob`** — `GET /<sha256>`. Returns the body as a `Blob` plus its content type. Auth-action `get`. With `verify: true` the body is hashed and compared to the requested `sha256`; a corrupt or lying server becomes a `ValidationFailure` instead of bad bytes. `expectedSize` caps the body read (see Request policy).
- **`createHeadBlob`** — `HEAD /<sha256>`. Returns `BlobHeaders` (`contentType`, `contentLength`). Auth-action `get`.
- **`createCheckUpload`** — `HEAD /upload` (BUD-06), or `HEAD /media` (BUD-05) with `endpoint: "media"`, signed with the same verb. Asks "would this upload succeed?" before sending the body, via `X-SHA-256`/`X-Content-Length`/`X-Content-Type` headers. Every HTTP answer resolves to a `CheckUploadOutcome`: `{ verdict: "accepted" }`, `{ verdict: "rejected", status, reason }` (reason from `X-Reason`), or `{ verdict: "unsupported", status }` for 404/405/501 — the pre-flights are optional, and a server without one says nothing about whether the upload would succeed. Only signing and transport faults are `Failure`s. Prefer `createUpload`'s `check: true` over calling this yourself; it is the same policy without hashing the file twice.
- **`createReportBlob`** — `PUT /report`. Signs a kind 1984 NIP-56 report referencing the blob's sha256 and sends it as the request body. Per BUD-09 this endpoint takes **no** kind-24242 auth header. It is a server-side report; it does not propagate over Nostr unless the operator forwards it.

### Multi-server orchestration — `application/`

A user's BUD-03 server list is an ordered fallback chain, and every consumer otherwise rewrites the same loops over it. These factories are those loops, done once, composed from the single-server use-cases above (same `BlossomDeps`, same abort controls):

- **`createListBlobsAcrossServers`** — lists the pubkey's blobs on every server concurrently and streams a `ListAcrossServersUpdate` to `onUpdate` as each server replies, never waiting for the slowest. Blobs are merged by hash with the servers each is present on; `respondedServers` / `failedServers` tell you which absences are meaningful. Returns a handle whose `abort()` cancels the in-flight requests — call it on teardown.
- **`createUploadWithMirrors`** — uploads to the first server, then asks the rest to mirror, concurrently. Only the primary upload decides success; per-mirror outcomes are reported in the result for the caller to surface or retry. `check: true` runs the BUD-06 check against the primary before its upload.
- **`createMirrorToServers`** — asks every server to mirror an existing blob, concurrently, resolving to a `ServerOutcome` per server. (`createUploadWithMirrors` composes this.)
- **`createDeleteFromServers`** — its delete twin: deletes a blob from every server, concurrently, resolving to a `ServerOutcome<void>` per server. One server's refusal does not stop the others.
- **`createGetBlobWithFallback`** — tries each server in preference order until one returns the blob. Every response is verified against the requested hash — a lying server counts as a failure and the chain moves on — so the resolved blob is guaranteed to be the content you addressed.

**`get` and `head` always sign a token**, so they work against servers that gate reads per pubkey; servers that need none ignore it. For anonymous public reads, fetch the blob URL directly.

### Internal — `application/authorised-request.ts`

`createAuthorisedRequest(deps)` is the single boundary that:

1. Builds the unsigned kind 24242 auth event, with a `server` tag naming the domain of the one server the request goes to, so a token that leaks from it is useless on any other (BUD-11's tag scoping).
2. Signs it via `BlossomSigner.signEvent` (returning the signer's `Failure` when it does not sign).
3. Encodes `Authorization: Nostr <credentials>` via `encodeBlossomAuthHeader`, in the unpadded base64url BUD-11 specifies; a header longer than the 4096 characters a server reads is a `validation` failure, and nothing is sent.
4. Calls `HttpClient.request(...)`.

Every authenticated use-case goes through this. Non-2xx / transport mapping is the injected `HttpClient`'s job (see its contract above), so a use-case only ever branches on a single `if (!response.success)`. Bodies are then parsed through `parseJsonResponse` + the domain parsers — one path, no per-use-case JSON validation.

## Wiring

The library ships no wiring of its own — the consumer assembles `BlossomDeps` once and feeds it to whichever use-case factories it needs:

```ts
import { createUpload } from "@innis/nostr-blossom"
import { createHttpClient, createLocalSigner, generateSecretKey } from "@innis/nostr-core"

const deps = {
  signer: createLocalSigner(generateSecretKey()),
  httpClient: createHttpClient(),
}

const upload = createUpload(deps)
const result = await upload({ serverUrl, file })
```

`deps` is reusable across every factory (`createListBlobs(deps)`, `createDeleteBlob(deps)`, …) — build it once.

## Testing

`@innis/nostr-blossom/testing` ships an in-memory Blossom network implementing the `HttpClient` port, so hosts drive the real use-cases against conformant BUD behaviour — BUD-11 token checking (signature, `created_at` at most sixty seconds ahead, expiry, one verb, `server` and `x` scoping, either header encoding), content addressing, BUD-12 list paging, cross-server mirroring — with no socket and no mocks of the lib itself:

```ts
import { createInMemoryBlossomNetwork } from "@innis/nostr-blossom/testing"

const network = createInMemoryBlossomNetwork()
const server = network.createServer("https://one.example.com")
const deps = { signer, httpClient: network.httpClient }

server.seedBlob({ data, pubkey })           // arrange state directly
server.setUnreachable(true)                 // simulate a dead server
server.getStoredBlobs()                     // assert what the server holds
```

`seedBlob` accepts a `sha256` override that makes the server lie about a blob's content — seed with it to exercise integrity verification — and an `uploaded` override to arrange the newest-first order `GET /list` pages through.

## Design decisions

The reasoning behind choices that go beyond the BUDs' plain text — why reads sign a token, why every token names its server, why a token lives an hour, why the host's `HttpClient` decides private addresses — is recorded in [`docs/adr/`](docs/adr/). Read it before changing them.

## Anti-patterns

- **Calling `fetch` inside this lib.** Always inject `HttpClient`.
- **Hand-rolling an `HttpClient` that returns success for `>= 400`.** Use `@innis/nostr-core`'s `createHttpClient()` or mirror its contract exactly.
- **Bypassing `createAuthorisedRequest`** for an authenticated call. The auth header / signing logic is centralised.
- **Catching in a use-case.** The signer and the `HttpClient` are `Result`-typed already.
- **Trusting unvalidated `Sha256` / `ServerUrl` inputs.** Use `createSha256` / `createServerUrl` and handle the `null`. Don't cast.
- **Confusing `createReportBlob` with a Nostr-relay publish.** It posts to the Blossom server's `/report` endpoint, not to a relay.
