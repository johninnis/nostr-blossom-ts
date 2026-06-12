import { assert, assertEquals } from "@std/assert"
import { createDeleteBlob } from "../../src/application/delete-blob.ts"
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

const testHashResult = createSha256("a".repeat(64))
assert(testHashResult.success)
const testHash = testHashResult.value

Deno.test("deleteBlob succeeds on 200", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, ""),
  )
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient })

  const result = await deleteBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
})

Deno.test("deleteBlob returns server error on 403", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(403, "Not authorised", { "x-reason": "Not authorised" }),
  )
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient })

  const result = await deleteBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})

Deno.test("deleteBlob forwards timeoutMs and signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await deleteBlob({
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
