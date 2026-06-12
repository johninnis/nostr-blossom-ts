import { assert, assertEquals } from "@std/assert"
import { createHeadBlob } from "../../src/application/head-blob.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult.success)
const testServerUrl = serverResult.value

const hashResult = createSha256("a".repeat(64))
assert(hashResult.success)
const testHash = hashResult.value

Deno.test("headBlob returns content type and length", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, "", { "content-type": "image/png", "content-length": "2048" }),
  )
  const headBlob = createHeadBlob({ signer: createFakeSigner(), httpClient })

  const result = await headBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
  assertEquals(result.value.contentType, "image/png")
  assertEquals(result.value.contentLength, 2048)
})

Deno.test("headBlob omits length when header missing or malformed", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, "", { "content-length": "not-a-number" }),
  )
  const headBlob = createHeadBlob({ signer: createFakeSigner(), httpClient })

  const result = await headBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
  assertEquals(result.value.contentLength, undefined)
  assertEquals(result.value.contentType, "application/octet-stream")
})

Deno.test("headBlob returns server error on 404", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(404, ""))
  const headBlob = createHeadBlob({ signer: createFakeSigner(), httpClient })

  const result = await headBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})

Deno.test("headBlob forwards timeoutMs and signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const headBlob = createHeadBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await headBlob({
    serverUrl: testServerUrl,
    sha256: testHash,
    timeoutMs: 5000,
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.timeoutMs, 5000)
  assertEquals(request.signal, controller.signal)
})
