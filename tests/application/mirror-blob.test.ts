import { assert, assertEquals } from "@std/assert"
import { parseAuthHeader } from "@innis/nostr-core"
import { createMirrorBlob } from "../../src/application/mirror-blob.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const testServerUrlResult = createServerUrl("https://blossom.example.com")
assert(testServerUrlResult.success)
const testServerUrl = testServerUrlResult.value

const testSha256Result = createSha256("c".repeat(64))
assert(testSha256Result.success)
const testSha256 = testSha256Result.value

Deno.test("mirrorBlob returns descriptor on success", async () => {
  const descriptor = {
    url: "https://blossom.example.com/mirrored.png",
    sha256: "c".repeat(64),
    size: 512,
    type: "image/png",
    uploaded: 1704067200,
  }

  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify(descriptor)),
  )
  const mirrorBlob = createMirrorBlob({ signer: createFakeSigner(), httpClient })

  const result = await mirrorBlob({
    serverUrl: testServerUrl,
    sourceUrl: "https://example.com/image.png",
    sha256: testSha256,
  })

  assert(result.success)
  assertEquals(result.value.sha256, "c".repeat(64))
})

Deno.test("mirrorBlob normalises an upper-case descriptor hash to lowercase", async () => {
  const descriptor = {
    url: "https://blossom.example.com/mirrored.png",
    sha256: "C".repeat(64),
    size: 512,
    type: "image/png",
    uploaded: 1704067200,
  }

  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify(descriptor)),
  )
  const mirrorBlob = createMirrorBlob({ signer: createFakeSigner(), httpClient })

  const result = await mirrorBlob({
    serverUrl: testServerUrl,
    sourceUrl: "https://example.com/image.png",
    sha256: testSha256,
  })

  assert(result.success)
  assertEquals(result.value.sha256, "c".repeat(64))
})

Deno.test("mirrorBlob rejects a descriptor with a malformed hash", async () => {
  const descriptor = {
    url: "https://blossom.example.com/mirrored.png",
    sha256: "not-a-hash",
    size: 512,
    type: "image/png",
    uploaded: 1704067200,
  }

  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify(descriptor)),
  )
  const mirrorBlob = createMirrorBlob({ signer: createFakeSigner(), httpClient })

  const result = await mirrorBlob({
    serverUrl: testServerUrl,
    sourceUrl: "https://example.com/image.png",
    sha256: testSha256,
  })

  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})

Deno.test("mirrorBlob authorises the blob via an x tag carrying its sha256", async () => {
  const descriptor = {
    url: "https://blossom.example.com/mirrored.png",
    sha256: "c".repeat(64),
    size: 512,
    type: "image/png",
    uploaded: 1704067200,
  }
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify(descriptor)))
  const mirrorBlob = createMirrorBlob({ signer: createFakeSigner(), httpClient: captured.client })

  const result = await mirrorBlob({
    serverUrl: testServerUrl,
    sourceUrl: "https://example.com/image.png",
    sha256: testSha256,
  })

  assert(result.success)
  const authHeader = captured.requests[0]?.headers?.Authorization
  assert(authHeader)
  const authEvent = parseAuthHeader(authHeader)
  assert(authEvent.success)
  assertEquals(authEvent.value.tags.filter((tag) => tag[0] === "x"), [["x", testSha256]])
})

Deno.test("mirrorBlob forwards timeoutMs and signal to the http client", async () => {
  const descriptor = {
    url: "https://blossom.example.com/mirrored.png",
    sha256: "c".repeat(64),
    size: 512,
    type: "image/png",
    uploaded: 1704067200,
  }
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify(descriptor)))
  const mirrorBlob = createMirrorBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await mirrorBlob({
    serverUrl: testServerUrl,
    sourceUrl: "https://example.com/image.png",
    sha256: testSha256,
    timeoutMs: 5000,
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.timeoutMs, 5000)
  assertEquals(request.signal, controller.signal)
})
