import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { createGetBlobWithFallback } from "../../src/application/get-blob-with-fallback.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"

const signer = createLocalSigner(generateSecretKey())

Deno.test("getBlobWithFallback returns the first server's blob when it has it", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const second = network.createServer("https://two.example.com")
  const descriptor = first.seedBlob({ data: new TextEncoder().encode("file-content"), type: "image/png" })
  const getBlobWithFallback = createGetBlobWithFallback({ signer, httpClient: network.httpClient })

  const result = await getBlobWithFallback({ servers: [first.url, second.url], sha256: descriptor.sha256 })

  assert(result.success)
  assertEquals(result.value.serverUrl, first.url)
  assertEquals(result.value.contentType, "image/png")
  assertEquals(await result.value.data.text(), "file-content")
})

Deno.test("getBlobWithFallback falls through a server missing the blob", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const second = network.createServer("https://two.example.com")
  const descriptor = second.seedBlob({ data: new TextEncoder().encode("file-content") })
  const getBlobWithFallback = createGetBlobWithFallback({ signer, httpClient: network.httpClient })

  const result = await getBlobWithFallback({ servers: [first.url, second.url], sha256: descriptor.sha256 })

  assert(result.success)
  assertEquals(result.value.serverUrl, second.url)
})

Deno.test("getBlobWithFallback falls through a server whose blob fails verification", async () => {
  const network = createInMemoryBlossomNetwork()
  const lying = network.createServer("https://one.example.com")
  const honest = network.createServer("https://two.example.com")
  const descriptor = honest.seedBlob({ data: new TextEncoder().encode("file-content") })
  lying.seedBlob({ data: new TextEncoder().encode("tampered-bytes"), sha256: descriptor.sha256 })
  const getBlobWithFallback = createGetBlobWithFallback({ signer, httpClient: network.httpClient })

  const result = await getBlobWithFallback({ servers: [lying.url, honest.url], sha256: descriptor.sha256 })

  assert(result.success)
  assertEquals(result.value.serverUrl, honest.url)
  assertEquals(await result.value.data.text(), "file-content")
})

Deno.test("getBlobWithFallback returns the last server's failure when every server fails", async () => {
  const network = createInMemoryBlossomNetwork()
  const down = network.createServer("https://one.example.com")
  const empty = network.createServer("https://two.example.com")
  down.setUnreachable(true)
  const descriptor = empty.seedBlob({ data: new TextEncoder().encode("file-content") })
  empty.clear()
  const getBlobWithFallback = createGetBlobWithFallback({ signer, httpClient: network.httpClient })

  const result = await getBlobWithFallback({ servers: [down.url, empty.url], sha256: descriptor.sha256 })

  assert(!result.success)
  assertEquals(result.error.type, "server")
})

Deno.test("getBlobWithFallback fails on an empty server list", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  const descriptor = server.seedBlob({ data: new TextEncoder().encode("file-content") })
  const getBlobWithFallback = createGetBlobWithFallback({ signer, httpClient: network.httpClient })

  const result = await getBlobWithFallback({ servers: [], sha256: descriptor.sha256 })

  assert(!result.success)
  assertEquals(result.error.type, "validation")
})
