import { assert, assertEquals, assertThrows } from "@std/assert"
import { createLocalSigner, encodeAuthHeader, generateSecretKey, parsePublicKey } from "@innis/nostr-core"
import { createUnsignedAuthEvent } from "../src/domain/auth.ts"
import { createSha256 } from "../src/domain/blob.ts"
import { createCheckUpload } from "../src/application/check-upload.ts"
import { createDeleteBlob } from "../src/application/delete-blob.ts"
import { createGetBlob } from "../src/application/get-blob.ts"
import { createHeadBlob } from "../src/application/head-blob.ts"
import { createListBlobs } from "../src/application/list-blobs.ts"
import { createReportBlob } from "../src/application/report-blob.ts"
import { createUpload } from "../src/application/upload-blob.ts"
import { adaptSigner } from "../src/infrastructure/signer-adapter.ts"
import { createInMemoryBlossomNetwork } from "../testing.ts"

const localSigner = createLocalSigner(generateSecretKey())
const signer = adaptSigner(localSigner)
const testPubkey = await localSigner.getPublicKey()

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
  await server.seedBlob({ data: new TextEncoder().encode("mine"), pubkey: testPubkey })
  await server.seedBlob({ data: new TextEncoder().encode("theirs"), pubkey: parsePublicKey("b".repeat(64)) })

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
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const deleteBlob = createDeleteBlob({ signer, httpClient: network.httpClient })

  const first = await deleteBlob({ serverUrl: server.url, sha256: descriptor.sha256 })
  const second = await deleteBlob({ serverUrl: server.url, sha256: descriptor.sha256 })

  assert(first.success)
  assertEquals(server.getStoredBlobs().length, 0)
  assert(!second.success)
  assertEquals(second.error.tag, "ServerError")
})

Deno.test("network answers a head request with the blob's type and length", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content"), type: "image/png" })

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
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content") })

  const result = await createCheckUpload({ signer, httpClient: network.httpClient })({
    serverUrl: server.url,
    sha256: descriptor.sha256,
    size: 12,
    contentType: "image/png",
  })

  assert(result.success)
})

Deno.test("network accepts a kind-1984 report", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content") })

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
  assert(result.error.tag === "ServerError")
  assertEquals(result.error.status, 401)
})

Deno.test("network fails requests to a server it does not host", async () => {
  const network = createInMemoryBlossomNetwork()

  const result = await network.httpClient.request({ url: "https://unknown.example.com/list/abc", method: "GET" })

  assert(!result.success)
  assertEquals(result.error.tag, "NetworkError")
})

Deno.test("network refuses a delete whose auth event names a different hash", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const wrongHash = createSha256("f".repeat(64))
  assert(wrongHash.success)
  const signed = await localSigner.signEvent(
    createUnsignedAuthEvent({ action: "delete", content: "Delete Blob", hashes: [wrongHash.value] }),
  )

  const result = await network.httpClient.request({
    url: `${server.url}/${descriptor.sha256}`,
    method: "DELETE",
    headers: { Authorization: encodeAuthHeader(signed) },
  })

  assert(!result.success)
  assert(result.error.tag === "ServerError")
  assertEquals(result.error.status, 401)
  assertEquals(server.getStoredBlobs().length, 1)
})

Deno.test("network honours an already-aborted request signal", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = await server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const controller = new AbortController()
  controller.abort()

  const result = await network.httpClient.request({
    url: descriptor.url,
    method: "GET",
    signal: controller.signal,
  })

  assert(!result.success)
  assertEquals(result.error.tag, "NetworkError")
})

Deno.test("network refuses a second server at the same origin", () => {
  const network = createInMemoryBlossomNetwork()
  network.createServer("https://one.example.com")

  assertThrows(() => network.createServer("https://one.example.com"), TypeError)
})
