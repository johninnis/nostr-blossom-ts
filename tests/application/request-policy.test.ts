import { assert, assertEquals } from "@std/assert"
import type { HttpClient, HttpRequest, PrivateAddressPolicy } from "@innis/nostr-core"
import { createHttpClient } from "@innis/nostr-core"
import { publicKeyFixture } from "@innis/nostr-core/testing"
import { createGetBlob, DEFAULT_MAX_BLOB_BYTES } from "../../src/application/get-blob.ts"
import { createGetBlobWithFallback } from "../../src/application/get-blob-with-fallback.ts"
import { createHeadBlob } from "../../src/application/head-blob.ts"
import { createListBlobs } from "../../src/application/list-blobs.ts"
import { createReportBlob } from "../../src/application/report-blob.ts"
import { createUpload } from "../../src/application/upload-blob.ts"
import { createCheckUpload } from "../../src/application/check-upload.ts"
import { createDeleteBlob } from "../../src/application/delete-blob.ts"
import { createMirrorBlob } from "../../src/application/mirror-blob.ts"
import { createUploadWithMirrors } from "../../src/application/upload-with-mirrors.ts"
import { createMirrorToServers } from "../../src/application/mirror-to-servers.ts"
import { createDeleteFromServers } from "../../src/application/delete-from-servers.ts"
import { createListBlobsAcrossServers } from "../../src/application/list-across-servers.ts"
import type { BlossomDeps } from "../../src/application/ports.ts"
import { createCapturingHttpClient, createFakeSigner, createFakeSuccessResponse } from "../_helpers/fakes.ts"
import { computeSha256, createServerUrl } from "../../src/domain/blob.ts"
import type { ServerUrl, Sha256 } from "../../src/domain/types.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult !== null)
const serverUrl = serverResult

const localServerResult = createServerUrl("http://localhost:3000")
assert(localServerResult !== null)
const localServerUrl = localServerResult

const BLOB = new TextEncoder().encode("blob-bytes")
const sha256: Sha256 = computeSha256(BLOB)
const otherHash = "b".repeat(64)

const capturedRequest = async (
  run: (
    deps: {
      signer: ReturnType<typeof createFakeSigner>
      httpClient: ReturnType<typeof createCapturingHttpClient>["client"]
    },
  ) => Promise<unknown>,
): Promise<HttpRequest> => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, "[]"))
  await run({ signer: createFakeSigner(), httpClient: captured.client })
  const request = captured.requests[0]
  assert(request)
  return request
}

Deno.test("getBlob follows a redirect only to a URL carrying the same sha256, as BUD-01 permits", async () => {
  const request = await capturedRequest((deps) => createGetBlob(deps)({ serverUrl, sha256 }))
  assert(request.followRedirectTo)
  assertEquals(
    [
      request.followRedirectTo(`https://cdn.example/${sha256}.png`),
      request.followRedirectTo(`https://cdn.example/${otherHash}.png`),
      request.followRedirectTo("https://cdn.example/login"),
    ],
    [true, false, false],
  )
})

Deno.test("getBlob caps the body at the expected size when the caller knows it", async () => {
  const request = await capturedRequest((deps) => createGetBlob(deps)({ serverUrl, sha256, expectedSize: 1234 }))
  assertEquals(request.maxBodyBytes, 1234)
})

Deno.test("getBlob caps the body at DEFAULT_MAX_BLOB_BYTES when the size is unknown", async () => {
  const request = await capturedRequest((deps) => createGetBlob(deps)({ serverUrl, sha256 }))
  assertEquals(request.maxBodyBytes, DEFAULT_MAX_BLOB_BYTES)
})

Deno.test("DEFAULT_MAX_BLOB_BYTES is 256 MiB", () => {
  assertEquals(DEFAULT_MAX_BLOB_BYTES, 256 * 1024 * 1024)
})

Deno.test("getBlobWithFallback passes the expected size to every attempt", async () => {
  const request = await capturedRequest((deps) =>
    createGetBlobWithFallback(deps)({ servers: [serverUrl], sha256, expectedSize: 99 })
  )
  assertEquals(request.maxBodyBytes, 99)
})

Deno.test("headBlob follows a redirect only to a URL carrying the same sha256, as BUD-01 permits", async () => {
  const request = await capturedRequest((deps) => createHeadBlob(deps)({ serverUrl, sha256 }))
  assert(request.followRedirectTo)
  assertEquals(
    [request.followRedirectTo(`https://cdn.example/${sha256}`), request.followRedirectTo("https://cdn.example/")],
    [true, false],
  )
})

const pubkey = publicKeyFixture("c".repeat(64))
const file = new File([BLOB], "blob.bin")

const EVERY_REQUEST: ReadonlyArray<
  readonly [string, (deps: BlossomDeps, server: ServerUrl) => Promise<unknown>]
> = [
  ["upload", (deps, server) => createUpload(deps)({ serverUrl: server, file })],
  [
    "checkUpload",
    (deps, server) => createCheckUpload(deps)({ serverUrl: server, sha256, size: 1, contentType: "text/plain" }),
  ],
  ["list", (deps, server) => createListBlobs(deps)({ serverUrl: server, pubkey })],
  ["delete", (deps, server) => createDeleteBlob(deps)({ serverUrl: server, sha256 })],
  [
    "mirror",
    (deps, server) => createMirrorBlob(deps)({ serverUrl: server, sourceUrl: "https://cdn.example/", sha256 }),
  ],
  ["get", (deps, server) => createGetBlob(deps)({ serverUrl: server, sha256 })],
  ["head", (deps, server) => createHeadBlob(deps)({ serverUrl: server, sha256 })],
  [
    "report",
    (deps, server) => createReportBlob(deps)({ serverUrl: server, sha256, reportType: "spam", reason: "spam" }),
  ],
  [
    "uploadWithMirrors",
    (deps, server) => createUploadWithMirrors(deps)({ servers: [server], file }),
  ],
  [
    "mirrorToServers",
    (deps, server) =>
      createMirrorToServers(deps)({
        servers: [server],
        sourceUrl: "https://cdn.example/",
        sha256,
      }),
  ],
  [
    "deleteFromServers",
    (deps, server) => createDeleteFromServers(deps)({ servers: [server], sha256 }),
  ],
  [
    "getBlobWithFallback",
    (deps, server) => createGetBlobWithFallback(deps)({ servers: [server], sha256 }),
  ],
  [
    "listAcrossServers",
    (deps, server) =>
      new Promise<void>((resolve) => {
        createListBlobsAcrossServers(deps)({
          servers: [server],
          pubkey,
          onUpdate: () => resolve(),
        })
      }),
  ],
]

const countingClient = (privateAddresses: PrivateAddressPolicy): { httpClient: HttpClient; fetched: () => number } => {
  let fetched = 0
  return {
    httpClient: createHttpClient(privateAddresses, () => {
      fetched++
      return Promise.resolve(new Response("[]"))
    }),
    fetched: () => fetched,
  }
}

for (const [name, run] of EVERY_REQUEST) {
  Deno.test(`${name} does not reach a server at a private address through a client that refuses one`, async () => {
    const client = countingClient("refuse-private")
    await run({ signer: createFakeSigner(), httpClient: client.httpClient }, localServerUrl)
    assertEquals(client.fetched(), 0)
  })

  Deno.test(`${name} reaches a user's own server at a private address through a client that allows one`, async () => {
    const client = countingClient("allow-private")
    await run({ signer: createFakeSigner(), httpClient: client.httpClient }, localServerUrl)
    assert(client.fetched() > 0)
  })
}

Deno.test("an authorised request other than a blob read neither follows redirects nor lifts the body cap", async () => {
  const request = await capturedRequest((deps) => createListBlobs(deps)({ serverUrl, pubkey }))
  assertEquals([request.followRedirectTo, request.maxBodyBytes], [undefined, undefined])
})

Deno.test("a report keeps every safe default", async () => {
  const request = await capturedRequest((deps) =>
    createReportBlob(deps)({ serverUrl, sha256, reportType: "spam", reason: "spam" })
  )
  assertEquals([request.followRedirectTo, request.maxBodyBytes], [undefined, undefined])
})

const redirectingFetch = (location: string): typeof globalThis.fetch => (_input, init) => {
  if (init?.redirect !== "follow") {
    return Promise.resolve(new Response(null, { status: 307, headers: { location } }))
  }
  const response = new Response(BLOB, { headers: { "content-type": "image/png" } })
  Object.defineProperty(response, "redirected", { value: true })
  Object.defineProperty(response, "url", { value: location })
  return Promise.resolve(response)
}

Deno.test("getBlob through the shipped client downloads a blob its server redirects to a CDN", async () => {
  const getBlob = createGetBlob({
    signer: createFakeSigner(),
    httpClient: createHttpClient("refuse-private", redirectingFetch(`https://cdn.example/${sha256}.png`)),
  })
  const result = await getBlob({ serverUrl, sha256, verify: true })
  assert(result.success)
  assertEquals(new Uint8Array(await result.value.data.arrayBuffer()), BLOB)
})

Deno.test("getBlob through the shipped client refuses a redirect to a URL without the blob's hash", async () => {
  const getBlob = createGetBlob({
    signer: createFakeSigner(),
    httpClient: createHttpClient("refuse-private", redirectingFetch("https://cdn.example/elsewhere")),
  })
  const result = await getBlob({ serverUrl, sha256 })
  assertEquals(result, {
    success: false,
    error: { type: "network", message: "redirect to https://cdn.example/elsewhere refused" },
  })
})

Deno.test("getBlob through a client that allows private addresses downloads from a user's own server on localhost", async () => {
  const getBlob = createGetBlob({
    signer: createFakeSigner(),
    httpClient: createHttpClient("allow-private", () => Promise.resolve(new Response(BLOB))),
  })
  const result = await getBlob({ serverUrl: localServerUrl, sha256 })
  assertEquals(result.success, true)
})

Deno.test("getBlob through the shipped client fails a blob larger than its expected size", async () => {
  const getBlob = createGetBlob({
    signer: createFakeSigner(),
    httpClient: createHttpClient("refuse-private", () => Promise.resolve(new Response(BLOB))),
  })
  const result = await getBlob({ serverUrl, sha256, expectedSize: BLOB.byteLength - 1 })
  assertEquals(result, {
    success: false,
    error: { type: "network", message: `response body exceeds ${BLOB.byteLength - 1} bytes` },
  })
})
