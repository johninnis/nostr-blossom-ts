/**
 * Test helpers for the `@innis/nostr-blossom` package: an in-memory Blossom server network
 * implementing the `HttpClient` port, so hosts can drive the real use-cases against conformant
 * BUD-01/02/04/05/06/09/11/12 behaviour — auth-event checking, content addressing, multi-server mirroring —
 * without a socket. Import from `@innis/nostr-blossom/testing`.
 *
 * @module
 */
import type {
  HttpClient,
  HttpRequest,
  HttpRequestFailure,
  HttpResponse,
  MalformedBodyFailure,
  NetworkFailure,
  NostrEvent,
  PublicKey,
  Result,
} from "@innis/nostr-core"
import {
  extractTagValues,
  failure,
  isEventExpired,
  isRecord,
  KIND_BLOSSOM_AUTHORISATION,
  KIND_REPORTING,
  now,
  ok,
  parseBlossomAuthHeader,
  parseJson,
  parseNostrEvent,
  soleTagValue,
  verifyEventSignature,
} from "@innis/nostr-core"
import type { AuthAction, BlobDescriptor, ServerUrl, Sha256, UploadEndpoint } from "./mod.ts"
import { buildBlobUrl, computeSha256, createServerUrl, extractSha256FromUrl } from "./mod.ts"

/** A blob held by an {@link InMemoryBlossomServer}, exposed for test assertions. `pubkey` is the uploader's, and is what `GET /list/<pubkey>` matches on; seeded blobs without one list under no pubkey. */
export interface StoredBlob {
  readonly sha256: Sha256
  readonly data: Uint8Array<ArrayBuffer>
  readonly type: string
  readonly uploaded: number
  readonly pubkey: string
}

/** Input to {@link InMemoryBlossomServer.seedBlob}. `sha256` overrides the computed hash, making the server lie about the blob's content — seed with it to test integrity verification. `uploaded` overrides the server's clock, to arrange the newest-first order `GET /list` pages through. */
export interface SeedBlobInput {
  readonly data: Uint8Array
  readonly type?: string
  readonly pubkey?: PublicKey
  readonly sha256?: Sha256
  readonly uploaded?: number
}

/** One fake Blossom server inside an {@link InMemoryBlossomNetwork}: its origin, its stored blobs, and test controls. */
export interface InMemoryBlossomServer {
  readonly url: ServerUrl
  /** Store a blob directly, bypassing upload auth; resolves to the descriptor the server will report. */
  readonly seedBlob: (input: SeedBlobInput) => BlobDescriptor
  readonly getStoredBlobs: () => ReadonlyArray<StoredBlob>
  /** While `true`, every request to this server fails with a `NetworkFailure`, as if it were down. */
  readonly setUnreachable: (unreachable: boolean) => void
  /** Discard every stored blob. */
  readonly clear: () => void
}

/** An in-memory network of fake Blossom servers behind one `HttpClient`. Wire `httpClient` into `BlossomDeps` and every use-case reaches whichever server its URL addresses; `PUT /mirror` resolves source URLs against the other servers in the network. */
export interface InMemoryBlossomNetwork {
  readonly httpClient: HttpClient
  readonly createServer: (url: string) => InMemoryBlossomServer
}

interface ServerState {
  readonly url: ServerUrl
  readonly blobs: Map<Sha256, StoredBlob>
  unreachable: boolean
}

interface StoreBlobInput {
  readonly data: Uint8Array
  readonly type?: string | undefined
  readonly pubkey?: string
  readonly sha256?: Sha256
  readonly uploaded?: number
}

const isScopedTo = (event: NostrEvent, server: ServerState): boolean => {
  const domains = extractTagValues(event.tags, "server")
  return domains.length === 0 || domains.includes(new URL(server.url).hostname)
}

const CLOCK_SKEW_TOLERANCE_SECONDS = 60

const isValidToken = (event: NostrEvent, server: ServerState, action: AuthAction): boolean => {
  const at = now()
  return event.kind === KIND_BLOSSOM_AUTHORISATION &&
    event.created_at <= at + CLOCK_SKEW_TOLERANCE_SECONDS &&
    extractTagValues(event.tags, "expiration").length > 0 &&
    !isEventExpired(event, at) &&
    soleTagValue(event.tags, "t").value === action &&
    isScopedTo(event, server) &&
    verifyEventSignature(event)
}

const authorisedEvent = (server: ServerState, request: HttpRequest, action: AuthAction): NostrEvent | null => {
  const decoded = parseBlossomAuthHeader(request.headers?.["Authorization"] ?? "")
  return decoded.success && isValidToken(decoded.value, server, action) ? decoded.value : null
}

const authorisesHash = (event: NostrEvent, sha256: string): boolean =>
  extractTagValues(event.tags, "x").includes(sha256)

const hashMismatchResponse = (): HttpResponse =>
  errorResponse(401, "authorisation event carries no x tag for this blob")

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const bodyBytes = (body: BodyInit | undefined): Uint8Array<ArrayBuffer> | null => {
  if (body instanceof ArrayBuffer) return new Uint8Array(body)
  if (body instanceof Uint8Array) return new Uint8Array(toArrayBuffer(body))
  if (typeof body === "string") return new TextEncoder().encode(body)
  return null
}

const NOT_JSON: MalformedBodyFailure = { type: "malformed-body", message: "response body is not JSON" }

const buildResponse = (
  status: number,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
): HttpResponse => {
  let read = false
  const readOnce = <T>(produce: () => T): Result<T, NetworkFailure> => {
    if (read) return failure({ type: "network", message: "body stream already read" })
    read = true
    return ok(produce())
  }
  const text = (): string => new TextDecoder().decode(body)
  return {
    status,
    headers: new Headers(headers),
    json: () => {
      const read = readOnce(text)
      if (!read.success) return Promise.resolve(read)
      const parsed = parseJson(read.value)
      return Promise.resolve(parsed.success ? parsed : failure(NOT_JSON))
    },
    text: () => Promise.resolve(readOnce(text)),
    blob: () => Promise.resolve(readOnce(() => new Blob([body], { type: headers["content-type"] ?? "" }))),
  }
}

const jsonResponse = (value: unknown): HttpResponse =>
  buildResponse(200, new TextEncoder().encode(JSON.stringify(value)), { "content-type": "application/json" })

const errorResponse = (status: number, reason: string): HttpResponse =>
  buildResponse(status, new Uint8Array(), { "x-reason": reason })

const unauthorisedResponse = (): HttpResponse => errorResponse(401, "missing or invalid authorisation event")

const descriptorFor = (server: ServerState, blob: StoredBlob): BlobDescriptor => ({
  url: buildBlobUrl(server.url, blob.sha256),
  sha256: blob.sha256,
  size: blob.data.length,
  type: blob.type,
  uploaded: blob.uploaded,
})

const storeBlob = (server: ServerState, input: StoreBlobInput): BlobDescriptor => {
  const data = new Uint8Array(toArrayBuffer(input.data))
  const blob: StoredBlob = {
    sha256: input.sha256 ?? computeSha256(data),
    data,
    type: input.type ?? "application/octet-stream",
    uploaded: input.uploaded ?? now(),
    pubkey: input.pubkey ?? "",
  }
  server.blobs.set(blob.sha256, blob)
  return descriptorFor(server, blob)
}

const handleUpload = (
  server: ServerState,
  request: HttpRequest,
  action: UploadEndpoint,
): HttpResponse => {
  const event = authorisedEvent(server, request, action)
  if (event === null) return unauthorisedResponse()
  const data = bodyBytes(request.body)
  if (data === null) return errorResponse(400, "missing upload body")
  const sha256 = computeSha256(data)
  if (!authorisesHash(event, sha256)) return hashMismatchResponse()
  return jsonResponse(
    storeBlob(server, { data, sha256, type: request.headers?.["Content-Type"], pubkey: event.pubkey }),
  )
}

const handleMirror = (
  servers: ReadonlyArray<ServerState>,
  server: ServerState,
  request: HttpRequest,
): HttpResponse => {
  const event = authorisedEvent(server, request, "upload")
  if (event === null) return unauthorisedResponse()
  const body = parseJson(typeof request.body === "string" ? request.body : "")
  const sourceUrl = body.success && isRecord(body.value) ? body.value.url : undefined
  if (typeof sourceUrl !== "string") return errorResponse(400, "mirror body carries no url")
  const sha256 = extractSha256FromUrl(sourceUrl)
  if (sha256 === null) return errorResponse(400, "URL carries no SHA-256 path segment")
  if (!authorisesHash(event, sha256)) return hashMismatchResponse()
  const origin = URL.parse(sourceUrl)?.origin
  const source = servers.find((candidate) => candidate.url === origin)
  const blob = source?.blobs.get(sha256)
  if (blob === undefined) return errorResponse(404, "source blob not found in network")
  server.blobs.set(blob.sha256, { ...blob, pubkey: event.pubkey })
  return jsonResponse(descriptorFor(server, blob))
}

const numberParam = (params: URLSearchParams, name: string): number | undefined => {
  const value = params.get(name)
  return value === null ? undefined : Number(value)
}

const pageAfterCursor = (blobs: ReadonlyArray<StoredBlob>, cursor: string | null): ReadonlyArray<StoredBlob> => {
  const position = blobs.findIndex((blob) => blob.sha256 === cursor)
  return position === -1 ? blobs : blobs.slice(position + 1)
}

const handleList = (server: ServerState, request: HttpRequest, pathPubkey: string): HttpResponse => {
  if (authorisedEvent(server, request, "list") === null) return unauthorisedResponse()
  const params = URL.parse(request.url)?.searchParams ?? new URLSearchParams()
  const since = numberParam(params, "since") ?? 0
  const until = numberParam(params, "until") ?? Infinity
  const newestFirst = [...server.blobs.values()]
    .filter((blob) => blob.pubkey === pathPubkey && blob.uploaded >= since && blob.uploaded <= until)
    .toSorted((a, b) => b.uploaded - a.uploaded)
  const page = pageAfterCursor(newestFirst, params.get("cursor")).slice(0, numberParam(params, "limit"))
  return jsonResponse(page.map((blob) => descriptorFor(server, blob)))
}

const handleDelete = (server: ServerState, request: HttpRequest): HttpResponse => {
  const event = authorisedEvent(server, request, "delete")
  if (event === null) return unauthorisedResponse()
  const sha256 = extractSha256FromUrl(request.url)
  if (sha256 === null) return errorResponse(400, "path carries no SHA-256")
  if (!authorisesHash(event, sha256)) return hashMismatchResponse()
  if (!server.blobs.delete(sha256)) return errorResponse(404, "blob not found")
  return jsonResponse({})
}

const handleReport = (request: HttpRequest): HttpResponse => {
  const body = parseJson(typeof request.body === "string" ? request.body : "")
  const event = body.success ? parseNostrEvent(body.value) : null
  if (event === null || event.kind !== KIND_REPORTING) {
    return errorResponse(400, "report body is not a kind-1984 event")
  }
  if (extractTagValues(event.tags, "x").length === 0) return errorResponse(400, "report names no blob")
  if (!verifyEventSignature(event)) return errorResponse(400, "report signature does not verify")
  return jsonResponse({})
}

const handleCheck = (server: ServerState, request: HttpRequest, action: UploadEndpoint): HttpResponse => {
  const event = authorisedEvent(server, request, action)
  if (event === null) return unauthorisedResponse()
  const declared = request.headers?.["X-SHA-256"]
  if (declared === undefined || !authorisesHash(event, declared)) return hashMismatchResponse()
  return buildResponse(200, new Uint8Array(), {})
}

const handleGetBlob = (server: ServerState, request: HttpRequest): HttpResponse => {
  const sha256 = extractSha256FromUrl(request.url)
  const blob = sha256 !== null ? server.blobs.get(sha256) : undefined
  if (blob === undefined) return errorResponse(404, "blob not found")
  const headers = { "content-type": blob.type, "content-length": String(blob.data.length) }
  return buildResponse(200, request.method === "HEAD" ? new Uint8Array() : blob.data, headers)
}

const route = (
  servers: ReadonlyArray<ServerState>,
  server: ServerState,
  request: HttpRequest,
): HttpResponse => {
  const [, first, second] = (URL.parse(request.url)?.pathname ?? "").split("/")
  if (request.method === "PUT" && (first === "upload" || first === "media")) {
    return handleUpload(server, request, first)
  }
  if (request.method === "HEAD" && (first === "upload" || first === "media")) return handleCheck(server, request, first)
  if (request.method === "PUT" && first === "mirror") return handleMirror(servers, server, request)
  if (request.method === "PUT" && first === "report") return handleReport(request)
  if (request.method === "GET" && first === "list" && second !== undefined) {
    return handleList(server, request, second)
  }
  if (request.method === "DELETE") return handleDelete(server, request)
  if (request.method === "GET" || request.method === "HEAD") return handleGetBlob(server, request)
  return errorResponse(404, "no such endpoint")
}

const respond = async (
  servers: ReadonlyArray<ServerState>,
  request: HttpRequest,
): Promise<Result<HttpResponse, HttpRequestFailure>> => {
  if (request.signal?.aborted === true) {
    return failure({ type: "network", message: "aborted" })
  }
  const parsed = URL.parse(request.url)
  const server = servers.find((candidate) => candidate.url === parsed?.origin)
  if (parsed === null || server === undefined || server.unreachable) {
    return failure({ type: "network", message: `no reachable in-memory Blossom server at ${request.url}` })
  }
  const response = route(servers, server, request)
  if (response.status >= 400) {
    return failure({ type: "server", status: response.status, message: response.headers.get("x-reason") ?? "" })
  }
  return ok(response)
}

/**
 * Create an {@link InMemoryBlossomNetwork}: add servers with `createServer`, seed or assert their
 * blobs through the returned {@link InMemoryBlossomServer} handles, and hand `httpClient` to the
 * use-case factories under test. Where the BUDs require a token, a request must carry a BUD-11 one this server
 * accepts: kind 24242 with a valid signature, a `created_at` at most sixty seconds ahead of the clock, an `expiration` not yet passed, one
 * `t` verb matching the endpoint, `server` tags (if any) naming this server's domain, and an `x` tag for the blob a
 * write names. Mirroring fetches from sibling servers in the network.
 */
export const createInMemoryBlossomNetwork = (): InMemoryBlossomNetwork => {
  const servers: Array<ServerState> = []

  const createServer = (url: string): InMemoryBlossomServer => {
    const branded = createServerUrl(url)
    if (branded === null) throw new TypeError(`not a valid http or https server URL: ${url}`)
    if (servers.some((existing) => existing.url === branded)) {
      throw new TypeError(`a server already exists at ${branded}`)
    }
    const state: ServerState = { url: branded, blobs: new Map(), unreachable: false }
    servers.push(state)
    return {
      url: state.url,
      seedBlob: (input) => storeBlob(state, input),
      getStoredBlobs: () => [...state.blobs.values()],
      setUnreachable: (unreachable) => {
        state.unreachable = unreachable
      },
      clear: () => state.blobs.clear(),
    }
  }

  return { httpClient: { request: (request) => respond(servers, request) }, createServer }
}
