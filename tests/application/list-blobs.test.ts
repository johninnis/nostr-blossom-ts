import { assert, assertEquals } from "@std/assert"
import { publicKeyFixture } from "@innis/nostr-core/testing"
import { createListBlobs } from "../../src/application/list-blobs.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl } from "../../src/domain/blob.ts"

const testServerUrlResult = createServerUrl("https://blossom.example.com")
assert(testServerUrlResult !== null)
const testServerUrl = testServerUrlResult
const testPubkey = publicKeyFixture("b".repeat(64))

Deno.test("listBlobs returns array of descriptors", async () => {
  const descriptors = [
    {
      url: "https://example.com/a.png",
      sha256: "a".repeat(64),
      size: 100,
      type: "image/png",
      uploaded: 1704067200,
    },
    {
      url: "https://example.com/b.jpg",
      sha256: "b".repeat(64),
      size: 200,
      type: "image/jpeg",
      uploaded: 1704153600,
    },
  ]

  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify(descriptors)),
  )
  const listBlobs = createListBlobs({ signer: createFakeSigner(), httpClient })

  const result = await listBlobs({ serverUrl: testServerUrl, pubkey: testPubkey })

  assert(result.success)
  assertEquals(result.value.length, 2)
})

Deno.test("listBlobs returns empty array when no blobs", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, "[]"),
  )
  const listBlobs = createListBlobs({ signer: createFakeSigner(), httpClient })

  const result = await listBlobs({ serverUrl: testServerUrl, pubkey: testPubkey })

  assert(result.success)
  assertEquals(result.value.length, 0)
})

Deno.test("listBlobs appends the encoded query string to the path", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, "[]"))
  const listBlobs = createListBlobs({ signer: createFakeSigner(), httpClient: captured.client })

  const result = await listBlobs({
    serverUrl: testServerUrl,
    pubkey: testPubkey,
    query: { since: 100, limit: 5 },
  })

  assert(result.success)
  assertEquals(
    captured.requests[0]?.url,
    `https://blossom.example.com/list/${testPubkey}?limit=5&since=100`,
  )
})

Deno.test("listBlobs forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, "[]"))
  const listBlobs = createListBlobs({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await listBlobs({
    serverUrl: testServerUrl,
    pubkey: testPubkey,
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})
