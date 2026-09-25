import { assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { createDeleteFromServers } from "../../src/application/delete-from-servers.ts"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"

const localSigner = createLocalSigner(generateSecretKey())
const signer = adaptSigner(localSigner)
const pubkey = await localSigner.getPublicKey()
const data = new TextEncoder().encode("file-content")

Deno.test("deleteFromServers deletes the blob from every server", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const second = network.createServer("https://two.example.com")
  const descriptor = await first.seedBlob({ data, pubkey })
  await second.seedBlob({ data, pubkey })
  const deleteFromServers = createDeleteFromServers({ signer, httpClient: network.httpClient })

  const outcomes = await deleteFromServers({ servers: [first.url, second.url], sha256: descriptor.sha256 })

  assertEquals(outcomes.map(({ serverUrl, result }) => [serverUrl, result.success]), [
    [first.url, true],
    [second.url, true],
  ])
  assertEquals(first.getStoredBlobs().length, 0)
  assertEquals(second.getStoredBlobs().length, 0)
})

Deno.test("deleteFromServers reports each server's outcome rather than stopping at the first failure", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const down = network.createServer("https://two.example.com")
  const third = network.createServer("https://three.example.com")
  const descriptor = await first.seedBlob({ data, pubkey })
  await third.seedBlob({ data, pubkey })
  down.setUnreachable(true)
  const deleteFromServers = createDeleteFromServers({ signer, httpClient: network.httpClient })

  const outcomes = await deleteFromServers({
    servers: [first.url, down.url, third.url],
    sha256: descriptor.sha256,
  })

  assertEquals(outcomes.map(({ serverUrl, result }) => [serverUrl, result.success]), [
    [first.url, true],
    [down.url, false],
    [third.url, true],
  ])
  assertEquals(third.getStoredBlobs().length, 0)
})

Deno.test("deleteFromServers resolves to no outcomes for no servers", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const descriptor = await first.seedBlob({ data, pubkey })
  const deleteFromServers = createDeleteFromServers({ signer, httpClient: network.httpClient })

  const outcomes = await deleteFromServers({ servers: [], sha256: descriptor.sha256 })

  assertEquals(outcomes.length, 0)
  assertEquals(first.getStoredBlobs().length, 1)
})
