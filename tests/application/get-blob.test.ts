import { assert, assertEquals } from "@std/assert"
import { createGetBlob } from "../../src/application/get-blob.ts"
import { createFakeHttpClient, createFakeSigner, createFakeSuccessResponse } from "./helpers.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult.success)
const testServerUrl = serverResult.value

const hashResult = createSha256("a".repeat(64))
assert(hashResult.success)
const testHash = hashResult.value

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

Deno.test("getBlob returns server error on 404", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(404, "Not found", { "x-reason": "Not found" }),
  )
  const getBlob = createGetBlob({ signer: createFakeSigner(), httpClient })

  const result = await getBlob({ serverUrl: testServerUrl, sha256: testHash })

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})
