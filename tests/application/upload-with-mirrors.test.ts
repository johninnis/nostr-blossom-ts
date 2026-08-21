import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { createUploadWithMirrors } from "../../src/application/upload-with-mirrors.ts"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"

const signer = adaptSigner(createLocalSigner(generateSecretKey()))

const testFile = (): File => new File(["file-content"], "a.png", { type: "image/png" })

Deno.test("uploadWithMirrors uploads to the primary server and mirrors to the rest", async () => {
  const network = createInMemoryBlossomNetwork()
  const primary = network.createServer("https://one.example.com")
  const mirror = network.createServer("https://two.example.com")
  const uploadWithMirrors = createUploadWithMirrors({ signer, httpClient: network.httpClient })

  const result = await uploadWithMirrors({ servers: [primary.url, mirror.url], file: testFile() })

  assert(result.success)
  assertEquals(result.value.blob.url, `https://one.example.com/${result.value.blob.sha256}`)
  assertEquals(result.value.mirrors.length, 1)
  assert(result.value.mirrors[0]?.result.success)
  assertEquals(mirror.getStoredBlobs()[0]?.sha256, result.value.blob.sha256)
})

Deno.test("uploadWithMirrors succeeds when a mirror fails, reporting the failed server", async () => {
  const network = createInMemoryBlossomNetwork()
  const primary = network.createServer("https://one.example.com")
  const mirror = network.createServer("https://two.example.com")
  mirror.setUnreachable(true)
  const uploadWithMirrors = createUploadWithMirrors({ signer, httpClient: network.httpClient })

  const result = await uploadWithMirrors({ servers: [primary.url, mirror.url], file: testFile() })

  assert(result.success)
  assertEquals(primary.getStoredBlobs().length, 1)
  const outcome = result.value.mirrors[0]
  assert(outcome)
  assertEquals(outcome.serverUrl, mirror.url)
  assert(!outcome.result.success)
})

Deno.test("uploadWithMirrors fails when the primary upload fails", async () => {
  const network = createInMemoryBlossomNetwork()
  const primary = network.createServer("https://one.example.com")
  const mirror = network.createServer("https://two.example.com")
  primary.setUnreachable(true)
  const uploadWithMirrors = createUploadWithMirrors({ signer, httpClient: network.httpClient })

  const result = await uploadWithMirrors({ servers: [primary.url, mirror.url], file: testFile() })

  assert(!result.success)
  assertEquals(mirror.getStoredBlobs().length, 0)
})

Deno.test("uploadWithMirrors uploads through the media endpoint when asked", async () => {
  const network = createInMemoryBlossomNetwork()
  const primary = network.createServer("https://one.example.com")
  const uploadWithMirrors = createUploadWithMirrors({ signer, httpClient: network.httpClient })

  const result = await uploadWithMirrors({ servers: [primary.url], file: testFile(), endpoint: "media" })

  assert(result.success)
  assertEquals(result.value.mirrors.length, 0)
})

Deno.test("uploadWithMirrors fails on an empty server list", async () => {
  const network = createInMemoryBlossomNetwork()
  const uploadWithMirrors = createUploadWithMirrors({ signer, httpClient: network.httpClient })

  const result = await uploadWithMirrors({ servers: [], file: testFile() })

  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})
