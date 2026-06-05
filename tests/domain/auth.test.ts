import { assert, assertEquals, assertExists } from "@std/assert"
import { BLOSSOM_AUTH_EXPIRATION_SECONDS, createUnsignedAuthEvent } from "../../src/domain/auth.ts"
import { encodeAuthHeader, now, parseEventId, parsePublicKey, parseSig } from "@innis/nostr-core"
import type { NostrEvent } from "@innis/nostr-core"
import { createSha256 } from "../../src/domain/blob.ts"
import { BLOSSOM_AUTH_EVENT_KIND } from "../../src/domain/types.ts"

const testHashResult = createSha256("a".repeat(64))
assert(testHashResult.success)
const testHash = testHashResult.value

Deno.test("createUnsignedAuthEvent sets kind 24242", () => {
  const event = createUnsignedAuthEvent({ action: "upload", content: "Upload Blob" })
  assertEquals(event.kind, BLOSSOM_AUTH_EVENT_KIND)
})

Deno.test("createUnsignedAuthEvent includes t tag", () => {
  const event = createUnsignedAuthEvent({ action: "delete", content: "Delete Blob" })
  const tTag = event.tags.find((t) => t[0] === "t")
  assertExists(tTag)
  assertEquals(tTag[1], "delete")
})

Deno.test("createUnsignedAuthEvent defaults expiration to created_at plus the auth window", () => {
  const event = createUnsignedAuthEvent({ action: "list", content: "List Blobs", createdAt: 1000 })
  const expTag = event.tags.find((t) => t[0] === "expiration")
  assertExists(expTag)
  assertEquals(expTag[1], String(1000 + BLOSSOM_AUTH_EXPIRATION_SECONDS))
})

Deno.test("createUnsignedAuthEvent includes x tags for hashes", () => {
  const event = createUnsignedAuthEvent({ action: "upload", content: "Upload", hashes: [testHash] })
  const xTags = event.tags.filter((t) => t[0] === "x")
  assertEquals(xTags.length, 1)
  const [xTag] = xTags
  if (!xTag) throw new Error("expected one x tag")
  assertEquals(xTag[1], testHash)
})

Deno.test("createUnsignedAuthEvent omits x tags when no hashes", () => {
  const event = createUnsignedAuthEvent({ action: "list", content: "List" })
  const xTags = event.tags.filter((t) => t[0] === "x")
  assertEquals(xTags.length, 0)
})

Deno.test("createUnsignedAuthEvent uses custom expiration", () => {
  const customExp = 9999999999
  const event = createUnsignedAuthEvent({ action: "get", content: "Get", expiration: customExp })
  const expTag = event.tags.find((t) => t[0] === "expiration")
  assertExists(expTag)
  assertEquals(expTag[1], String(customExp))
})

Deno.test("createUnsignedAuthEvent pins created_at when provided, else stamps the clock", () => {
  assertEquals(createUnsignedAuthEvent({ action: "get", content: "Get", createdAt: 42 }).created_at, 42)
  assert(createUnsignedAuthEvent({ action: "get", content: "Get" }).created_at >= now())
})

Deno.test("createUnsignedAuthEvent sets content", () => {
  const event = createUnsignedAuthEvent({ action: "upload", content: "My custom content" })
  assertEquals(event.content, "My custom content")
})

Deno.test("encodeAuthHeader produces Nostr-prefixed base64 string", () => {
  const event: NostrEvent = {
    kind: BLOSSOM_AUTH_EVENT_KIND,
    content: "test",
    created_at: 1000,
    tags: [],
    id: parseEventId("a".repeat(64)),
    pubkey: parsePublicKey("b".repeat(64)),
    sig: parseSig("0".repeat(128)),
  }
  const header = encodeAuthHeader(event)
  assert(header.startsWith("Nostr "))
  const encoded = header.slice(6)
  assert(!encoded.includes("-"))
  assert(!encoded.includes("_"))
})
