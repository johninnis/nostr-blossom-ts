import { assert, assertEquals } from "@std/assert"
import { createCheckUpload } from "../../src/application/check-upload.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "./helpers.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult.success)
const testServerUrl = serverResult.value

const hashResult = createSha256("a".repeat(64))
assert(hashResult.success)
const testHash = hashResult.value

const input = { serverUrl: testServerUrl, sha256: testHash, size: 1024, contentType: "image/png" }

Deno.test("checkUpload succeeds and sends BUD-06 headers to HEAD /upload", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient: captured.client })

  const result = await checkUpload(input)

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.method, "HEAD")
  assertEquals(request.url, "https://blossom.example.com/upload")
  assertEquals(request.headers?.["X-SHA-256"], testHash)
  assertEquals(request.headers?.["X-Content-Length"], "1024")
  assertEquals(request.headers?.["X-Content-Type"], "image/png")
})

Deno.test("checkUpload surfaces a 413 as a server error", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(413, "Too large", { "x-reason": "Too large" }),
  )
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient })

  const result = await checkUpload(input)

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})

Deno.test("checkUpload forwards timeoutMs and signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await checkUpload({ ...input, timeoutMs: 5000, signal: controller.signal })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.timeoutMs, 5000)
  assertEquals(request.signal, controller.signal)
})
