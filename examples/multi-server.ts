// deno-lint-ignore-file no-console

/**
 * Walkthrough of the main features of @innis/nostr-blossom.
 *
 * Run with: `deno run examples/multi-server.ts` (no permissions required — the servers are the
 * in-memory network from `@innis/nostr-blossom/testing`, so everything runs locally).
 *
 * Against real servers, swap the network's httpClient for `createHttpClient()` from
 * `@innis/nostr-core` and the ServerUrls for your own — every other line stays the same.
 */

import { createLocalSigner, generateSecretKey } from "@innis/nostr-core"
import {
  adaptSigner,
  buildBlobUrl,
  buildFallbackUrls,
  createGetBlobWithFallback,
  createListBlobsAcrossServers,
  createUploadWithMirrors,
  extractSha256FromUrl,
} from "../mod.ts"
import { createInMemoryBlossomNetwork } from "../testing.ts"

const banner = (title: string): void => {
  console.log(`\n--- ${title} ---`)
}

// 1. Wire the dependency bundle once: a Result-returning signer and an HttpClient.
banner("1. Wiring")
const localSigner = createLocalSigner(generateSecretKey())
const pubkey = await localSigner.getPublicKey()
const network = createInMemoryBlossomNetwork()
const primary = network.createServer("https://one.example.com")
const mirror = network.createServer("https://two.example.com")
const deps = { signer: adaptSigner(localSigner), httpClient: network.httpClient }
console.log("servers:", primary.url, mirror.url)

// 2. Upload to the preferred server, mirror to the rest (BUD-02 + BUD-04).
banner("2. Upload with mirrors")
const uploadWithMirrors = createUploadWithMirrors(deps)
const file = new File(["hello blossom"], "hello.txt", { type: "text/plain" })
const uploaded = await uploadWithMirrors({ servers: [primary.url, mirror.url], file, endpoint: "upload" })
if (!uploaded.success) throw new Error(uploaded.error.message)
console.log("stored at:  ", uploaded.value.blob.url)
console.log("mirrors ok: ", uploaded.value.mirrors.every((outcome) => outcome.result.success))

// 3. Stream the account's blobs from every server as each replies (BUD-02 over a BUD-03 list).
banner("3. List across servers")
const listAcrossServers = createListBlobsAcrossServers(deps)
await new Promise<void>((resolve) => {
  listAcrossServers({
    servers: [primary.url, mirror.url],
    pubkey,
    onUpdate: (update) => {
      console.log(`responded ${update.respondedServers.length}/2, blobs merged: ${update.blobs.length}`)
      if (update.respondedServers.length === 2) resolve()
    },
  })
})

// 4. Blob URLs are pure domain data — build them and read hashes back out.
banner("4. URL helpers")
const sha256 = uploaded.value.blob.sha256
console.log("blob URL:    ", buildBlobUrl(primary.url, sha256, "txt"))
console.log("hash from URL:", extractSha256FromUrl(buildBlobUrl(mirror.url, sha256, "txt")))
console.log("fallbacks:   ", buildFallbackUrls(uploaded.value.blob.url, [mirror.url]))

// 5. Verified fallback download: a lying server is skipped, the honest one serves (BUD-01 + BUD-03).
banner("5. Verified download with fallback")
const liar = network.createServer("https://liar.example.com")
await liar.seedBlob({ data: new TextEncoder().encode("tampered content"), sha256 })
const getBlobWithFallback = createGetBlobWithFallback(deps)
const fetched = await getBlobWithFallback({ servers: [liar.url, mirror.url], sha256 })
if (!fetched.success) throw new Error(fetched.error.message)
console.log("served by:", fetched.value.serverUrl === mirror.url ? "the honest mirror" : "the liar (!)")
console.log("content:  ", await fetched.value.data.text())
