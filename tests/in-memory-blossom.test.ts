import { assert, assertEquals, assertThrows } from "@std/assert"
import type { NostrEvent, UnsignedEvent } from "@innis/nostr-core"
import {
  createLocalSigner,
  encodeAuthHeader,
  encodeBlossomAuthHeader,
  generateSecretKey,
  now,
  ok,
  serialiseEvent,
} from "@innis/nostr-core"
import { publicKeyFixture } from "@innis/nostr-core/testing"
import { createUnsignedAuthEvent } from "../src/domain/auth.ts"
import { createSha256 } from "../src/domain/blob.ts"
import { createCheckUpload } from "../src/application/check-upload.ts"
import { createDeleteBlob } from "../src/application/delete-blob.ts"
import { createGetBlob } from "../src/application/get-blob.ts"
import { createHeadBlob } from "../src/application/head-blob.ts"
import { createListBlobs } from "../src/application/list-blobs.ts"
import { createReportBlob } from "../src/application/report-blob.ts"
import { createUpload } from "../src/application/upload-blob.ts"
import { createInMemoryBlossomNetwork } from "../testing.ts"

const localSigner = createLocalSigner(generateSecretKey())
const signer = localSigner
const localPubkey = await localSigner.getPublicKey()
if (!localPubkey.success) throw new Error("a local signer always has its key")
const testPubkey = localPubkey.value

Deno.test("network serves an uploaded blob back with its content type", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const deps = { signer, httpClient: network.httpClient }
  const uploaded = await createUpload(deps)({
    serverUrl: server.url,
    file: new File(["file-content"], "a.png", { type: "image/png" }),
  })
  assert(uploaded.success)

  const result = await createGetBlob(deps)({ serverUrl: server.url, sha256: uploaded.value.sha256, verify: true })

  assert(result.success)
  assertEquals(result.value.contentType, "image/png")
  assertEquals(await result.value.data.text(), "file-content")
})

Deno.test("network lists only the requested pubkey's blobs", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  server.seedBlob({ data: new TextEncoder().encode("mine"), pubkey: testPubkey })
  server.seedBlob({ data: new TextEncoder().encode("theirs"), pubkey: publicKeyFixture("b".repeat(64)) })

  const result = await createListBlobs({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    pubkey: testPubkey,
  })

  assert(result.success)
  assertEquals(result.value.length, 1)
})

Deno.test("network deletes a stored blob and 404s a second delete", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const deleteBlob = createDeleteBlob({ signer, httpClient: network.httpClient })

  const first = await deleteBlob({ serverUrl: server.url, sha256: descriptor.sha256 })
  const second = await deleteBlob({ serverUrl: server.url, sha256: descriptor.sha256 })

  assert(first.success)
  assertEquals(server.getStoredBlobs().length, 0)
  assert(!second.success)
  assertEquals(second.error.type, "server")
})

Deno.test("network answers a head request with the blob's type and length", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content"), type: "image/png" })

  const result = await createHeadBlob({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    sha256: descriptor.sha256,
  })

  assert(result.success)
  assertEquals(result.value.contentType, "image/png")
  assertEquals(result.value.contentLength, "file-content".length)
})

Deno.test("network accepts a check-upload probe", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })

  const result = await createCheckUpload({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    sha256: descriptor.sha256,
    size: 12,
    contentType: "image/png",
  })

  assertEquals(result, ok({ verdict: "accepted" }))
})

Deno.test("network accepts a media pre-flight probe", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })

  const result = await createCheckUpload({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    sha256: descriptor.sha256,
    size: 12,
    contentType: "image/png",
    endpoint: "media",
  })

  assertEquals(result, ok({ verdict: "accepted" }))
})

Deno.test("network accepts a kind-1984 report", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })

  const result = await createReportBlob({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    sha256: descriptor.sha256,
    reportType: "spam",
    reason: "test report",
  })

  assert(result.success)
})

Deno.test("network refuses an upload without an authorisation event", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")

  const result = await network.httpClient.request({
    url: `${server.url}/upload`,
    method: "PUT",
    body: "file-content",
  })

  assert(!result.success)
  assert(result.error.type === "server")
  assertEquals(result.error.status, 401)
})

Deno.test("network fails requests to a server it does not host", async () => {
  const network = createInMemoryBlossomNetwork()

  const result = await network.httpClient.request({ url: "https://unknown.example.com/list/abc", method: "GET" })

  assert(!result.success)
  assertEquals(result.error.type, "network")
})

Deno.test("network refuses a delete whose auth event names a different hash", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const wrongHash = createSha256("f".repeat(64))
  assert(wrongHash !== null)
  const signed = await localSigner.signEvent(
    createUnsignedAuthEvent({ action: "delete", content: "Delete Blob", hashes: [wrongHash] }),
  )
  assert(signed.success)
  const authorization = encodeBlossomAuthHeader(signed.value)
  assert(authorization !== null)

  const result = await network.httpClient.request({
    url: `${server.url}/${descriptor.sha256}`,
    method: "DELETE",
    headers: { Authorization: authorization },
  })

  assert(!result.success)
  assert(result.error.type === "server")
  assertEquals(result.error.status, 401)
  assertEquals(server.getStoredBlobs().length, 1)
})

Deno.test("network honours an already-aborted request signal", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const controller = new AbortController()
  controller.abort()

  const result = await network.httpClient.request({
    url: descriptor.url,
    method: "GET",
    signal: controller.signal,
  })

  assert(!result.success)
  assertEquals(result.error.type, "network")
})

Deno.test("network refuses a second server at the same origin", () => {
  const network = createInMemoryBlossomNetwork()
  network.createServer("https://one.example.com")

  assertThrows(() => network.createServer("https://one.example.com"), TypeError)
})

const DATA = new TextEncoder().encode("file-content")

const deleteWith = async (
  edit: (unsigned: UnsignedEvent) => UnsignedEvent,
  encode: (event: NostrEvent) => string | null = encodeBlossomAuthHeader,
  tamper: (event: NostrEvent) => NostrEvent = (event) => event,
): Promise<number> => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: DATA })
  const unsigned = createUnsignedAuthEvent({
    action: "delete",
    content: "Delete Blob",
    hashes: [descriptor.sha256],
    server: server.url,
  })
  const signed = await localSigner.signEvent(edit(unsigned))
  assert(signed.success)
  const result = await network.httpClient.request({
    url: `${server.url}/${descriptor.sha256}`,
    method: "DELETE",
    headers: { Authorization: encode(tamper(signed.value)) ?? "" },
  })
  return result.success ? result.value.status : result.error.type === "server" ? result.error.status : 0
}

const withTags = (unsigned: UnsignedEvent, tags: UnsignedEvent["tags"]): UnsignedEvent => ({ ...unsigned, tags })

Deno.test("network accepts a token it should, as the baseline for the refusals below", async () => {
  assertEquals(await deleteWith((unsigned) => unsigned), 200)
})

Deno.test("network still reads a token in the padded base64 clients wrote before BUD-11", async () => {
  assertEquals(await deleteWith((unsigned) => unsigned, encodeAuthHeader), 200)
})

Deno.test("network refuses an expired token", async () => {
  assertEquals(
    await deleteWith((unsigned) =>
      withTags(unsigned, unsigned.tags.map((tag) => tag[0] === "expiration" ? ["expiration", String(now() - 1)] : tag))
    ),
    401,
  )
})

Deno.test("network refuses a token that states no expiration", async () => {
  assertEquals(
    await deleteWith((unsigned) => withTags(unsigned, unsigned.tags.filter((tag) => tag[0] !== "expiration"))),
    401,
  )
})

Deno.test("network refuses a token created in the future", async () => {
  assertEquals(await deleteWith((unsigned) => ({ ...unsigned, created_at: now() + 600 })), 401)
})

Deno.test("network refuses a token scoped to another server", async () => {
  assertEquals(
    await deleteWith((unsigned) =>
      withTags(unsigned, unsigned.tags.map((tag) => tag[0] === "server" ? ["server", "two.example.com"] : tag))
    ),
    401,
  )
})

Deno.test("network accepts a token with no server tags on any server", async () => {
  assertEquals(
    await deleteWith((unsigned) => withTags(unsigned, unsigned.tags.filter((tag) => tag[0] !== "server"))),
    200,
  )
})

Deno.test("network refuses a token naming two verbs", async () => {
  assertEquals(await deleteWith((unsigned) => withTags(unsigned, [...unsigned.tags, ["t", "upload"]])), 401)
})

Deno.test("network refuses a token whose signature does not verify", async () => {
  assertEquals(
    await deleteWith((unsigned) => unsigned, encodeBlossomAuthHeader, (event) => ({ ...event, content: "altered" })),
    401,
  )
})

Deno.test("network refuses a report that names no blob", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const signed = await localSigner.signEvent({ kind: 1984, content: "", created_at: now(), tags: [] })
  assert(signed.success)

  const result = await network.httpClient.request({
    url: `${server.url}/report`,
    method: "PUT",
    body: serialiseEvent(signed.value),
  })

  assert(!result.success)
  assert(result.error.type === "server")
  assertEquals(result.error.status, 400)
})

Deno.test("network lists newest first and pages by cursor and limit, as BUD-12 defines", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const [oldest, middle, newest] = [1, 2, 3].map((uploaded) =>
    server.seedBlob({ data: new TextEncoder().encode(`blob-${uploaded}`), pubkey: testPubkey, uploaded })
  )
  assert(oldest && middle && newest)
  const listBlobs = createListBlobs({ signer, httpClient: network.httpClient })

  const first = await listBlobs({ serverUrl: server.url, pubkey: testPubkey, query: { limit: 2 } })
  const second = await listBlobs({
    serverUrl: server.url,
    pubkey: testPubkey,
    query: { cursor: middle.sha256, limit: 2 },
  })

  assert(first.success && second.success)
  assertEquals(
    [first.value.map((blob) => blob.sha256), second.value.map((blob) => blob.sha256)],
    [[newest.sha256, middle.sha256], [oldest.sha256]],
  )
})

Deno.test("network filters a list by since and until", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const seeded = [1, 2, 3].map((uploaded) =>
    server.seedBlob({ data: new TextEncoder().encode(`blob-${uploaded}`), pubkey: testPubkey, uploaded })
  )

  const result = await createListBlobs({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    pubkey: testPubkey,
    query: { since: 2, until: 2 },
  })

  assert(result.success)
  assertEquals(result.value.map((blob) => blob.sha256), [seeded[1]?.sha256])
})
