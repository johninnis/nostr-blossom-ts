/**
 * Test helpers for the `@innis/nostr-blossom` package: an in-memory Blossom server network
 * implementing the `HttpClient` port, so hosts can drive the real use-cases against conformant
 * BUD-01/02/04/06/09 behaviour — auth-event checking, content addressing, multi-server mirroring —
 * without a socket. Import from `@innis/nostr-blossom/testing`.
 *
 * @module
 */
import type { HttpClient, HttpRequest, HttpResponse, NostrEvent, PublicKey, Result } from "@innis/nostr-core"
import {
  extractTagValues,
  failure,
  getTagValue,
  isRecord,
  NetworkError,
  now,
  ok,
  parseNostrEvent,
  ServerError,
  tryParseJson,
} from "@innis/nostr-core"
import type { BlobDescriptor, ServerUrl, Sha256 } from "./mod.ts"
import {
  BLOSSOM_AUTH_EVENT_KIND,
  buildBlobUrl,
  computeSha256,
  createServerUrl,
  extractSha256FromUrl,
  REPORT_EVENT_KIND,
} from "./mod.ts"

/** A blob held by an {@link InMemoryBlossomServer}, exposed for test assertions. `pubkey` is the uploader's, and is what `GET /list/<pubkey>` matches on; seeded blobs without one list under no pubkey. */
export interface StoredBlob {
  readonly sha256: Sha256
  readonly data: Uint8Array<ArrayBuffer>
  readonly type: string
  readonly uploaded: number
  readonly pubkey: string
}

/** Input to {@link InMemoryBlossomServer.seedBlob}. `sha256` overrides the computed hash, making the server lie about the blob's content — seed with it to test integrity verification. */
export interface SeedBlobInput {
  readonly data: Uint8Array
  readonly type?: string
  readonly pubkey?: PublicKey
  readonly sha256?: Sha256
}

/** One fake Blossom server inside an {@link InMemoryBlossomNetwork}: its origin, its stored blobs, and test controls. */
export interface InMemoryBlossomServer {
  readonly url: ServerUrl
  /** Store a blob directly, bypassing upload auth; resolves to the descriptor the server will report. */
  readonly seedBlob: (input: SeedBlobInput) => Promise<BlobDescriptor>
  readonly getStoredBlobs: () => ReadonlyArray<StoredBlob>
  /** While `true`, every request to this server fails with a `NetworkError`, as if it were down. */
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
  readonly type?: string
  readonly pubkey?: string
  readonly sha256?: Sha256
}

const authorisedEvent = (request: HttpRequest, action: string): NostrEvent | null => {
  const header = request.headers?.["Authorization"]
  if (header === undefined || !header.startsWith("Nostr ")) return null
  let decoded: string
  try {
    decoded = atob(header.slice("Nostr ".length))
  } catch {
    return null
  }
  const event = parseNostrEvent(tryParseJson(decoded))
  if (event === null || event.kind !== BLOSSOM_AUTH_EVENT_KIND) return null
  return getTagValue(event.tags, "t") === action ? event : null
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

const buildResponse = (
  status: number,
  body: Uint8Array<ArrayBuffer>,
  headers: Record<string, string>,
): HttpResponse => {
  let read = false
  const readOnce = <T>(produce: () => T): Result<T, NetworkError> => {
    if (read) return failure(new NetworkError("body stream already read"))
    read = true
    return ok(produce())
  }
  const text = (): string => new TextDecoder().decode(body)
  return {
    status,
    headers: new Headers(headers),
    json: () => Promise.resolve(readOnce(() => JSON.parse(text()))),
    text: () => Promise.resolve(readOnce(text)),
    blob: () => Promise.resolve(readOnce(() => new Blob([body], { type: headers["content-type"] }))),
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

const hashOf = async (data: Uint8Array<ArrayBuffer>): Promise<Sha256> => {
  const computed = await computeSha256(data)
  if (!computed.success) throw new TypeError(computed.error.message)
  return computed.value
}

const storeBlob = async (server: ServerState, input: StoreBlobInput): Promise<BlobDescriptor> => {
  const data = new Uint8Array(toArrayBuffer(input.data))
  const blob: StoredBlob = {
    sha256: input.sha256 ?? await hashOf(data),
    data,
    type: input.type ?? "application/octet-stream",
    uploaded: now(),
    pubkey: input.pubkey ?? "",
  }
  server.blobs.set(blob.sha256, blob)
  return descriptorFor(server, blob)
}

const handleUpload = async (
  server: ServerState,
  request: HttpRequest,
  action: "upload" | "media",
): Promise<HttpResponse> => {
  const event = authorisedEvent(request, action)
  if (event === null) return unauthorisedResponse()
  const data = bodyBytes(request.body)
  if (data === null) return errorResponse(400, "missing upload body")
  const sha256 = await hashOf(data)
  if (!authorisesHash(event, sha256)) return hashMismatchResponse()
  return jsonResponse(
    await storeBlob(server, { data, sha256, type: request.headers?.["Content-Type"], pubkey: event.pubkey }),
  )
}

const handleMirror = (
  servers: ReadonlyArray<ServerState>,
  server: ServerState,
  request: HttpRequest,
): HttpResponse => {
  const event = authorisedEvent(request, "upload")
  if (event === null) return unauthorisedResponse()
  const body = tryParseJson(typeof request.body === "string" ? request.body : "")
  const sourceUrl = isRecord(body) ? body.url : undefined
  if (typeof sourceUrl !== "string") return errorResponse(400, "mirror body carries no url")
  const sha256 = extractSha256FromUrl(sourceUrl)
  if (!sha256.success) return errorResponse(400, sha256.error.message)
  if (!authorisesHash(event, sha256.value)) return hashMismatchResponse()
  const origin = URL.parse(sourceUrl)?.origin
  const source = servers.find((candidate) => candidate.url === origin)
  const blob = source?.blobs.get(sha256.value)
  if (blob === undefined) return errorResponse(404, "source blob not found in network")
  server.blobs.set(blob.sha256, { ...blob, pubkey: event.pubkey })
  return jsonResponse(descriptorFor(server, blob))
}

const handleList = (server: ServerState, request: HttpRequest, pathPubkey: string): HttpResponse => {
  if (authorisedEvent(request, "list") === null) return unauthorisedResponse()
  const descriptors = [...server.blobs.values()]
    .filter((blob) => blob.pubkey === pathPubkey)
    .map((blob) => descriptorFor(server, blob))
  return jsonResponse(descriptors)
}

const handleDelete = (server: ServerState, request: HttpRequest): HttpResponse => {
  const event = authorisedEvent(request, "delete")
  if (event === null) return unauthorisedResponse()
  const sha256 = extractSha256FromUrl(request.url)
  if (!sha256.success) return errorResponse(400, "path carries no SHA-256")
  if (!authorisesHash(event, sha256.value)) return hashMismatchResponse()
  if (!server.blobs.delete(sha256.value)) return errorResponse(404, "blob not found")
  return jsonResponse({})
}

const handleReport = (request: HttpRequest): HttpResponse => {
  const event = parseNostrEvent(tryParseJson(typeof request.body === "string" ? request.body : ""))
  if (event === null || event.kind !== REPORT_EVENT_KIND) {
    return errorResponse(400, "report body is not a kind-1984 event")
  }
  return jsonResponse({})
}

const handleGetBlob = (server: ServerState, request: HttpRequest): HttpResponse => {
  const sha256 = extractSha256FromUrl(request.url)
  const blob = sha256.success ? server.blobs.get(sha256.value) : undefined
  if (blob === undefined) return errorResponse(404, "blob not found")
  const headers = { "content-type": blob.type, "content-length": String(blob.data.length) }
  return buildResponse(200, request.method === "HEAD" ? new Uint8Array() : blob.data, headers)
}

const route = async (
  servers: ReadonlyArray<ServerState>,
  server: ServerState,
  request: HttpRequest,
): Promise<HttpResponse> => {
  const [, first, second] = (URL.parse(request.url)?.pathname ?? "").split("/")
  if (request.method === "PUT" && (first === "upload" || first === "media")) {
    return handleUpload(server, request, first)
  }
  if (request.method === "HEAD" && first === "upload") {
    const event = authorisedEvent(request, "upload")
    if (event === null) return unauthorisedResponse()
    const declared = request.headers?.["X-SHA-256"]
    if (declared === undefined || !authorisesHash(event, declared)) return hashMismatchResponse()
    return buildResponse(200, new Uint8Array(), {})
  }
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
): Promise<Result<HttpResponse, NetworkError | ServerError>> => {
  if (request.signal?.aborted === true) {
    return failure(new NetworkError("aborted"))
  }
  const parsed = URL.parse(request.url)
  const server = servers.find((candidate) => candidate.url === parsed?.origin)
  if (parsed === null || server === undefined || server.unreachable) {
    return failure(new NetworkError(`no reachable in-memory Blossom server at ${request.url}`))
  }
  const response = await route(servers, server, request)
  if (response.status >= 400) {
    return failure(new ServerError(response.status, response.headers.get("x-reason") ?? ""))
  }
  return ok(response)
}

/**
 * Create an {@link InMemoryBlossomNetwork}: add servers with `createServer`, seed or assert their
 * blobs through the returned {@link InMemoryBlossomServer} handles, and hand `httpClient` to the
 * use-case factories under test. Requests are checked for a valid kind-24242 authorisation event
 * where the BUDs require one, and mirroring fetches from sibling servers in the network.
 */
export const createInMemoryBlossomNetwork = (): InMemoryBlossomNetwork => {
  const servers: Array<ServerState> = []

  const createServer = (url: string): InMemoryBlossomServer => {
    const branded = createServerUrl(url)
    if (!branded.success) throw new TypeError(branded.error.message)
    if (servers.some((existing) => existing.url === branded.value)) {
      throw new TypeError(`a server already exists at ${branded.value}`)
    }
    const state: ServerState = { url: branded.value, blobs: new Map(), unreachable: false }
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
