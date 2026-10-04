import { assert, assertEquals } from "@std/assert"
import { createGetBlob } from "../../src/application/get-blob.ts"
import {
  createCapturingHttpClient,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { computeSha256, createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult !== null)
const testServerUrl = serverResult

const hashResult = createSha256("a".repeat(64))
assert(hashResult !== null)
const testHash = hashResult

Deno.test("getBlob returns blob data and content type", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, "binary-bytes", { "content-type": "image/png" }),
  )
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
  assertEquals(result.value.contentType, "image/png")
  assertEquals(await result.value.data.text(), "binary-bytes")
})

Deno.test("getBlob defaults content type when header absent", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "x"))
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
  assertEquals(result.value.contentType, "application/octet-stream")
})

Deno.test("getBlob returns a server failure on 404", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(404, "Not found", { "x-reason": "Not found" }),
  )
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

Deno.test("getBlob with verify accepts a body matching the requested hash", async () => {
  const body = "binary-bytes"
  const digest = computeSha256(await new Blob([body]).arrayBuffer())
  assert(digest !== null)
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, body))
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: digest, verify: true })

  assert(result.success)
  assertEquals(await result.value.data.text(), body)
})

Deno.test("getBlob with verify rejects a body that does not hash to the requested hash", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "tampered-bytes"))
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash, verify: true })

  assert(!result.success)
  assertEquals(result.error.type, "validation")
})

Deno.test("getBlob forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, "x"))
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await getBlob({
    serverUrl: testServerUrl,
    sha256: testHash,
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

Deno.test("getBlob without verify returns the body unhashed, even one that does not match", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "tampered-bytes"))
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(result.success)
  assertEquals(await result.value.data.text(), "tampered-bytes")
})
