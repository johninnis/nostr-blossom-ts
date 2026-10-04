import { assert, assertEquals } from "@std/assert"
import { ok, parseBlossomAuthHeader } from "@innis/nostr-core"
import { createCheckUpload } from "../../src/application/check-upload.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult !== null)
const testServerUrl = serverResult

const hashResult = createSha256("a".repeat(64))
assert(hashResult !== null)
const testHash = hashResult

const input = { serverUrl: testServerUrl, sha256: testHash, size: 1024, contentType: "image/png" }

Deno.test("checkUpload accepts and sends BUD-06 headers to HEAD /upload", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient: captured.client })

  const result = await checkUpload(input)

  assertEquals(result, ok({ verdict: "accepted" }))
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.method, "HEAD")
  assertEquals(request.url, "https://blossom.example.com/upload")
  assertEquals(request.headers?.["X-SHA-256"], testHash)
  assertEquals(request.headers?.["X-Content-Length"], "1024")
  assertEquals(request.headers?.["X-Content-Type"], "image/png")
})

Deno.test("checkUpload reports a 413 as rejected with the server's status and reason", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(413, "Too large", { "x-reason": "Too large" }),
  )
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient })

  const result = await checkUpload(input)

  assertEquals(result, ok({ verdict: "rejected", status: 413, reason: "Too large" }))
})

for (const status of [404, 405, 501]) {
  Deno.test(`checkUpload reports a ${status} as a server without the check endpoint`, async () => {
    const httpClient = createFakeHttpClient(createFakeSuccessResponse(status, "no such endpoint"))
    const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient })

    const result = await checkUpload(input)

    assertEquals(result, ok({ verdict: "unsupported", status }))
  })
}

Deno.test("checkUpload fails when the request cannot be signed", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFailingSigner(), httpClient })

  const result = await checkUpload(input)

  assert(!result.success)
  assertEquals(result.error.type, "sign-failed")
})

Deno.test("checkUpload forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await checkUpload({ ...input, signal: controller.signal })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

Deno.test("checkUpload for the media endpoint asks HEAD /media with a media token, as BUD-05 defines", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const checkUpload = createCheckUpload({ signer: createFakeSigner(), httpClient: captured.client })

  await checkUpload({ ...input, endpoint: "media" })

  const request = captured.requests[0]
  assert(request)
  const token = parseBlossomAuthHeader(request.headers?.Authorization ?? "")
  assert(token.success)
  assertEquals(
    [request.method, request.url, token.value.tags.filter((tag) => tag[0] === "t")],
    ["HEAD", "https://blossom.example.com/media", [["t", "media"]]],
  )
})
