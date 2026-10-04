import { assert, assertEquals } from "@std/assert"
import type { HttpClient, HttpRequest } from "@innis/nostr-core"
import { createLocalSigner, failure, generateSecretKey } from "@innis/nostr-core"
import { createUpload } from "../../src/application/upload-blob.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"
import {
  createCapturingHttpClient,
  createFailingSigner,
  createFakeHttpClient,
  createFakeSigner,
  createFakeSuccessResponse,
} from "../_helpers/fakes.ts"
import { createServerUrl } from "../../src/domain/blob.ts"

const testServerUrlResult = createServerUrl("https://blossom.example.com")
assert(testServerUrlResult !== null)
const testServerUrl = testServerUrlResult

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

Deno.test("upload returns the signing failure", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "{}"))
  const upload = createUpload({ signer: createFailingSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.type, "sign-failed")
})

Deno.test("upload returns a server failure on 4xx", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(413, "File too large", { "x-reason": "File too large" }),
  )
  const upload = createUpload({ signer: createFakeSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

Deno.test("upload returns a validation failure on malformed descriptor", async () => {
  const httpClient = createFakeHttpClient(
    createFakeSuccessResponse(200, JSON.stringify({ not: "a descriptor" })),
  )
  const upload = createUpload({ signer: createFakeSigner(), httpClient })

  const result = await upload({ serverUrl: testServerUrl, file: testFile() })

  assert(!result.success)
  assertEquals(result.error.type, "validation")
})

Deno.test("upload returns a validation failure, not a network one, when the descriptor body is not JSON", async () => {
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, "<html>not json</html>"))
  const result = await createUpload({ signer: createFakeSigner(), httpClient })({
    serverUrl: testServerUrl,
    file: testFile(),
  })
  assertEquals(result, failure({ type: "validation", message: "malformed Blossom blob descriptor" }))
})

Deno.test("upload forwards its signal to the http client", async () => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, JSON.stringify(descriptor)))
  const upload = createUpload({ signer: createFakeSigner(), httpClient: captured.client })
  const controller = new AbortController()

  const result = await upload({
    serverUrl: testServerUrl,
    file: testFile(),
    signal: controller.signal,
  })

  assert(result.success)
  const request = captured.requests[0]
  assert(request)
  assertEquals(request.signal, controller.signal)
})

const signer = createLocalSigner(generateSecretKey())

const isCheckRequest = (request: HttpRequest): boolean =>
  request.method === "HEAD" && URL.parse(request.url)?.pathname === "/upload"

/** Record every request sent; answer BUD-06 checks with `answerCheck` when given, else pass them through. */
const recording = (
  inner: HttpClient,
  answerCheck?: () => ReturnType<HttpClient["request"]>,
): { readonly httpClient: HttpClient; readonly requests: ReadonlyArray<HttpRequest> } => {
  const requests: Array<HttpRequest> = []
  return {
    requests,
    httpClient: {
      request: (request) => {
        requests.push(request)
        return answerCheck !== undefined && isCheckRequest(request) ? answerCheck() : inner.request(request)
      },
    },
  }
}

Deno.test("upload with check sends the BUD-06 check with the uploaded hash before the body", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient, requests } = recording(network.httpClient)
  const upload = createUpload({ signer, httpClient })

  const result = await upload({ serverUrl: server.url, file: testFile(), check: true })

  assert(result.success)
  assertEquals(requests.map((request) => request.method), ["HEAD", "PUT"])
  assertEquals(requests[0]?.headers?.["X-SHA-256"], result.value.sha256)
  assertEquals(requests[0]?.headers?.["X-Content-Length"], "5")
  assertEquals(requests[0]?.headers?.["X-Content-Type"], "image/png")
  assertEquals(server.getStoredBlobs().length, 1)
})

Deno.test("upload without check sends only the body", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient, requests } = recording(network.httpClient)

  const result = await createUpload({ signer, httpClient })({ serverUrl: server.url, file: testFile() })

  assert(result.success)
  assertEquals(requests.map((request) => request.method), ["PUT"])
})

Deno.test("upload with check fails with the server's status and reason before sending bytes when rejected", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient, requests } = recording(
    network.httpClient,
    () => Promise.resolve(failure({ type: "server", status: 413, message: "blob exceeds 1 byte limit" })),
  )

  const result = await createUpload({ signer, httpClient })({ serverUrl: server.url, file: testFile(), check: true })

  assert(!result.success)
  assertEquals(result.error, { type: "server", status: 413, message: "blob exceeds 1 byte limit" })
  assertEquals(requests.map((request) => request.method), ["HEAD"])
  assertEquals(server.getStoredBlobs().length, 0)
})

Deno.test("upload with check proceeds when the server has no check endpoint", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient } = recording(
    network.httpClient,
    () => Promise.resolve(failure({ type: "server", status: 405, message: "method not allowed" })),
  )

  const result = await createUpload({ signer, httpClient })({ serverUrl: server.url, file: testFile(), check: true })

  assert(result.success)
  assertEquals(server.getStoredBlobs().length, 1)
})

Deno.test("upload with check fails without sending bytes when the check cannot reach the server", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient, requests } = recording(
    network.httpClient,
    () => Promise.resolve(failure({ type: "network", message: "offline" })),
  )

  const result = await createUpload({ signer, httpClient })({ serverUrl: server.url, file: testFile(), check: true })

  assert(!result.success)
  assertEquals(result.error.type, "network")
  assertEquals(requests.map((request) => request.method), ["HEAD"])
})

Deno.test("upload to the media endpoint with check runs the BUD-05 media pre-flight, not the upload one", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const { httpClient, requests } = recording(network.httpClient)
  const upload = createUpload({ signer, httpClient })

  const result = await upload({ serverUrl: server.url, file: testFile(), endpoint: "media", check: true })

  assert(result.success)
  assertEquals(requests.map((request) => `${request.method} ${request.url}`), [
    "HEAD https://one.example.com/media",
    "PUT https://one.example.com/media",
  ])
})
