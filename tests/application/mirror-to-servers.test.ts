import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import { createMirrorToServers } from "../../src/application/mirror-to-servers.ts"
import { createSha256 } from "../../src/domain/blob.ts"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"

const signer = adaptSigner(createLocalSigner(generateSecretKey()))

Deno.test("mirrorToServers mirrors a stored blob to every server", async () => {
  const network = createInMemoryBlossomNetwork()
  const source = network.createServer("https://one.example.com")
  const first = network.createServer("https://two.example.com")
  const second = network.createServer("https://three.example.com")
  const descriptor = await source.seedBlob({ data: new TextEncoder().encode("file-content") })
  const mirrorToServers = createMirrorToServers({ signer, httpClient: network.httpClient })

  const outcomes = await mirrorToServers({
    servers: [first.url, second.url],
    sourceUrl: descriptor.url,
    sha256: descriptor.sha256,
  })

  assertEquals(outcomes.map((outcome) => outcome.serverUrl), [first.url, second.url])
  assert(outcomes.every((outcome) => outcome.result.success))
  assertEquals(first.getStoredBlobs()[0]?.sha256, descriptor.sha256)
  assertEquals(second.getStoredBlobs()[0]?.sha256, descriptor.sha256)
})

Deno.test("mirrorToServers reports a failing server without stopping the others", async () => {
  const network = createInMemoryBlossomNetwork()
  const source = network.createServer("https://one.example.com")
  const healthy = network.createServer("https://two.example.com")
  const down = network.createServer("https://three.example.com")
  down.setUnreachable(true)
  const descriptor = await source.seedBlob({ data: new TextEncoder().encode("file-content") })
  const mirrorToServers = createMirrorToServers({ signer, httpClient: network.httpClient })

  const outcomes = await mirrorToServers({
    servers: [healthy.url, down.url],
    sourceUrl: descriptor.url,
    sha256: descriptor.sha256,
  })

  assert(outcomes[0]?.result.success)
  assert(outcomes[1] && !outcomes[1].result.success)
  assertEquals(healthy.getStoredBlobs().length, 1)
  assertEquals(down.getStoredBlobs().length, 0)
})

Deno.test("mirrorToServers resolves to no outcomes for no servers", async () => {
  const network = createInMemoryBlossomNetwork()
  const mirrorToServers = createMirrorToServers({ signer, httpClient: network.httpClient })
  const sha256 = createSha256("a".repeat(64))
  assert(sha256.success)

  const outcomes = await mirrorToServers({
    servers: [],
    sourceUrl: `https://one.example.com/${sha256.value}`,
    sha256: sha256.value,
  })

  assertEquals(outcomes.length, 0)
})
