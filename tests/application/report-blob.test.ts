import { assert, assertEquals } from "@std/assert"
import { createReportBlob } from "../../src/application/report-blob.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "./helpers.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"
import { REPORT_EVENT_KIND } from "../../src/domain/types.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult.success)
const testServerUrl = serverResult.value

const hashResult = createSha256("a".repeat(64))
assert(hashResult.success)
const testHash = hashResult.value

const input = {
  serverUrl: testServerUrl,
  sha256: testHash,
  reportType: "spam" as const,
  reason: "obvious spam",
}

Deno.test("reportBlob PUTs a signed kind 1984 event to /report without auth", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const reportBlob = createReportBlob({ signer: createFakeSigner(), httpClient: captured.client })

  const result = await reportBlob(input)

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.method, "PUT")
  assertEquals(request.url, "https://blossom.example.com/report")
  assertEquals(request.headers?.Authorization, undefined)
  assert(typeof request.body === "string")
  const event = JSON.parse(request.body)
  assertEquals(event.kind, REPORT_EVENT_KIND)
  assertEquals(event.tags[0], ["x", testHash, "spam"])
})

Deno.test("reportBlob returns error on signing failure", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, ""))
  const reportBlob = createReportBlob({ signer: createFailingSigner(), httpClient })

  const result = await reportBlob(input)

  assert(!result.success)
  assertEquals(result.error.tag, "SigningError")
})

Deno.test("reportBlob returns server error on 500", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(500, "boom"))
  const reportBlob = createReportBlob({ signer: createFakeSigner(), httpClient })

  const result = await reportBlob(input)

  assert(!result.success)
  assertEquals(result.error.tag, "ServerError")
})
