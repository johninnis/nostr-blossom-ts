import { assert, assertEquals } from "@std/assert"
import { ok } from "@innis/nostr-core"
import { createReportBlob } from "../../src/application/report-blob.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"
import { KIND_REPORTING } from "@innis/nostr-core"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult !== null)
const testServerUrl = serverResult

const hashResult = createSha256("a".repeat(64))
assert(hashResult !== null)
const testHash = hashResult

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
  assertEquals(event.kind, KIND_REPORTING)
  assertEquals(event.tags[0], ["x", testHash, "spam"])
})

Deno.test("reportBlob returns the signing failure", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, ""))
  const reportBlob = createReportBlob({ signer: createFailingSigner(), httpClient })

  const result = await reportBlob(input)

  assert(!result.success)
  assertEquals(result.error.type, "sign-failed")
})

Deno.test("reportBlob returns a server failure on 500", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(500, "boom"))
  const reportBlob = createReportBlob({ signer: createFakeSigner(), httpClient })

  const result = await reportBlob(input)

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

Deno.test("reportBlob forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  const reportBlob = createReportBlob({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await reportBlob({ ...input, signal: controller.signal })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

Deno.test("reportBlob sends the signed report as its seven NIP-01 fields, whatever else the signer returns", async () => {
  const signer = createFakeSigner()
  const addingSigner: typeof signer = {
    ...signer,
    signEvent: async (template) => {
      const signed = await signer.signEvent(template)
      return signed.success ? ok({ ...signed.value, relays: ["wss://relay.example"] }) : signed
    },
  }
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))

  await createReportBlob({ signer: addingSigner, httpClient: captured.client })(input)

  const body = captured.requests[0]?.body
  assertEquals(typeof body === "string" ? Object.keys(JSON.parse(body)) : null, [
    "id",
    "pubkey",
    "created_at",
    "kind",
    "tags",
    "content",
    "sig",
  ])
})
