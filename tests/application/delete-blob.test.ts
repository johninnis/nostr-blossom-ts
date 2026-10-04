import { assert, assertEquals } from "@std/assert"
import { createDeleteBlob } from "../../src/application/delete-blob.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"
import type { BlossomSigner } from "../../src/application/ports.ts"

const testServerUrlResult = createServerUrl("https://blossom.example.com")
assert(testServerUrlResult !== null)
const testServerUrl = testServerUrlResult

const testHashResult = createSha256("a".repeat(64))
assert(testHashResult !== null)
const testHash = testHashResult

Deno.test("deleteBlob succeeds on 200", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, ""),
  )
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient })

  const result = await deleteBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
})

Deno.test("deleteBlob returns a server failure on 403", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(403, "Not authorised", { "x-reason": "Not authorised" }),
  )
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient })

  const result = await deleteBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

Deno.test("deleteBlob forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const deleteBlob = createDeleteBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await deleteBlob({
    serverUrl: testServerUrl,
    sha256: testHash,
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

Deno.test("deleteBlob sends nothing and returns a validation failure when the signed proof is longer than a server reads", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const signer = createFakeSigner()
  const oversizedSigner: BlossomSigner = {
    signEvent: (event) => signer.signEvent({ ...event, content: "a".repeat(4096) }),
  }
  const deleteBlob = createDeleteBlob({ signer: oversizedSigner, httpClient: captured.client })

  const result = await deleteBlob({ serverUrl: testServerUrl, sha256: testHash })

  assertEquals([result.success ? null : result.error.type, captured.requests.length], ["validation", 0])
})
