import { assert, assertEquals } from "@std/assert"
import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import type { ListAcrossServersUpdate } from "../../src/application/list-across-servers.ts"
import { createListBlobsAcrossServers } from "../../src/application/list-across-servers.ts"
import { adaptSigner } from "../../src/infrastructure/signer-adapter.ts"
import { createServerUrl } from "../../src/domain/blob.ts"
import type { ServerUrl } from "../../src/domain/types.ts"
import { createFakeHttpClient, createFakeSuccessResponse } from "../_helpers/fakes.ts"
import { createInMemoryBlossomNetwork } from "../../testing.ts"

const localSigner = createLocalSigner(generateSecretKey())
const signer = adaptSigner(localSigner)
const testPubkey = await localSigner.getPublicKey()

const serverUrlFixture = (url: string): ServerUrl => {
  const result = createServerUrl(url)
  assert(result.success)
  return result.value
}

const collectUntilAllResponded = (
  run: (onUpdate: (update: ListAcrossServersUpdate) => void) => void,
  serverCount: number,
): Promise<ReadonlyArray<ListAcrossServersUpdate>> =>
  new Promise((resolve) => {
    const updates: Array<ListAcrossServersUpdate> = []
    run((update) => {
      updates.push(update)
      if (update.respondedServers.length === serverCount) resolve(updates)
    })
  })

Deno.test("listBlobsAcrossServers merges blobs by hash as each server replies", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const second = network.createServer("https://two.example.com")
  const shared = await first.seedBlob({ data: new TextEncoder().encode("shared"), pubkey: testPubkey })
  await second.seedBlob({ data: new TextEncoder().encode("shared"), pubkey: testPubkey })
  const extra = await second.seedBlob({ data: new TextEncoder().encode("only-on-two"), pubkey: testPubkey })
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient: network.httpClient })

  const updates = await collectUntilAllResponded(
    (onUpdate) => listAcrossServers({ servers: [first.url, second.url], pubkey: testPubkey, onUpdate }),
    2,
  )

  const last = updates.at(-1)
  assert(last)
  assertEquals(last.blobs.length, 2)
  assertEquals(last.failedServers.length, 0)
  const sharedBlob = last.blobs.find((entry) => entry.blob.sha256 === shared.sha256)
  assertEquals(sharedBlob?.servers.length, 2)
  const extraBlob = last.blobs.find((entry) => entry.blob.sha256 === extra.sha256)
  assertEquals(extraBlob?.servers, [second.url])
})

Deno.test("listBlobsAcrossServers delivers an update per server without waiting for all", async () => {
  const network = createInMemoryBlossomNetwork()
  const first = network.createServer("https://one.example.com")
  const second = network.createServer("https://two.example.com")
  await first.seedBlob({ data: new TextEncoder().encode("blob"), pubkey: testPubkey })
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient: network.httpClient })

  const updates = await collectUntilAllResponded(
    (onUpdate) => listAcrossServers({ servers: [first.url, second.url], pubkey: testPubkey, onUpdate }),
    2,
  )

  assertEquals(updates.length, 2)
  assertEquals(updates[0]?.respondedServers.length, 1)
})

Deno.test("listBlobsAcrossServers reports a failing server and keeps the others' blobs", async () => {
  const network = createInMemoryBlossomNetwork()
  const healthy = network.createServer("https://one.example.com")
  const down = network.createServer("https://two.example.com")
  down.setUnreachable(true)
  await healthy.seedBlob({ data: new TextEncoder().encode("blob"), pubkey: testPubkey })
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient: network.httpClient })

  const updates = await collectUntilAllResponded(
    (onUpdate) => listAcrossServers({ servers: [healthy.url, down.url], pubkey: testPubkey, onUpdate }),
    2,
  )

  const last = updates.at(-1)
  assert(last)
  assertEquals(last.failedServers, [down.url])
  assertEquals(last.blobs.length, 1)
})

Deno.test("listBlobsAcrossServers records a server once when it lists a blob twice", async () => {
  const descriptor = {
    url: `https://one.example.com/${"a".repeat(64)}`,
    sha256: "a".repeat(64),
    size: 1,
    type: "image/png",
    uploaded: 1704067200,
  }
  const httpClient = createFakeHttpClient(createFakeSuccessResponse(200, JSON.stringify([descriptor, descriptor])))
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient })

  const updates = await collectUntilAllResponded(
    (onUpdate) =>
      listAcrossServers({ servers: [serverUrlFixture("https://one.example.com")], pubkey: testPubkey, onUpdate }),
    1,
  )

  assertEquals(updates.at(-1)?.blobs.length, 1)
  assertEquals(updates.at(-1)?.blobs[0]?.servers.length, 1)
})

Deno.test("listBlobsAcrossServers stops delivering updates once aborted", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  await server.seedBlob({ data: new TextEncoder().encode("blob"), pubkey: testPubkey })
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient: network.httpClient })
  const updates: Array<ListAcrossServersUpdate> = []

  const handle = listAcrossServers({
    servers: [server.url],
    pubkey: testPubkey,
    onUpdate: (update) => updates.push(update),
  })
  handle.abort()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assertEquals(updates.length, 0)
})

Deno.test("listBlobsAcrossServers honours an already-aborted caller signal", async () => {
  const network = createInMemoryBlossomNetwork()
  const server = network.createServer("https://one.example.com")
  await server.seedBlob({ data: new TextEncoder().encode("blob"), pubkey: testPubkey })
  const listAcrossServers = createListBlobsAcrossServers({ signer, httpClient: network.httpClient })
  const controller = new AbortController()
  controller.abort()
  const updates: Array<ListAcrossServersUpdate> = []

  listAcrossServers({
    servers: [server.url],
    pubkey: testPubkey,
    signal: controller.signal,
    onUpdate: (update) => updates.push(update),
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assertEquals(updates.length, 0)
})
