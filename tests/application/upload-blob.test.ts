import { assert, assertEquals } from "@std/assert"
import { createUpload } from "../../src/application/upload-blob.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "./helpers.ts"
import { createServerUrl } from "../../src/domain/blob.ts"

const testServerUrlResult = createServerUrl("https://blossom.example.com")
assert(testServerUrlResult.success)
const testServerUrl = testServerUrlResult.value

const descriptor = {
  url: "https://blossom.example.com/abc.png",
  sha256: "a".repeat(64),
  size: 1024,
  type: "image/png",
  uploaded: 1704067200,
}

const testFile = (): File => new File(["hello"], "test.png", { type: "image/png" })

Deno.test("upload returns blob descriptor on success", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify(descriptor)),
  )
  const upload = createUpload({ signer: createFakeSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(result.success)
  assertEquals(result.value.sha256, descriptor.sha256)
  assertEquals(result.value.size, 1024)
})

Deno.test("upload targets /upload by default and /media when requested", async () => {
  const blob = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify(descriptor)))
  await createUpload({ signer: createFakeSigner(), httpClient: blob.client })({
    serverUrl: testServerUrl,
    file: testFile(),
  })
  assertEquals(blob.requests[0]?.url, "https://blossom.example.com/upload")

  const media = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify(descriptor)))
  await createUpload({ signer: createFakeSigner(), httpClient: media.client })({
    serverUrl: testServerUrl,
    file: testFile(),
    endpoint: "media",
  })
  assertEquals(media.requests[0]?.url, "https://blossom.example.com/media")
})

Deno.test("upload returns error on signing failure", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "{}"))
  const upload = createUpload({ signer: createFailingSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.tag, "SigningError")
})

Deno.test("upload returns server error on 4xx", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(413, "File too large", { "x-reason": "File too large" }),
  )
  const upload = createUpload({ signer: createFakeSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})

Deno.test("upload returns validation error on malformed descriptor", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ not: "a descriptor" })),
  )
  const upload = createUpload({ signer: createFakeSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})
