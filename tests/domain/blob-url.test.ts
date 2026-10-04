import { assert, assertEquals } from "@std/assert"
import { buildBlobUrl, buildFallbackUrls, extractSha256FromUrl } from "../../src/domain/blob-url.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"

const serverResult = createServerUrl("https://blossom.example.com")
assert(serverResult !== null)
const testServerUrl = serverResult

const hashResult = createSha256("a".repeat(64))
assert(hashResult !== null)
const testHash = hashResult

Deno.test("buildBlobUrl joins server origin and hash", () => {
  assertEquals(buildBlobUrl(testServerUrl, testHash), `https://blossom.example.com/${testHash}`)
})

Deno.test("buildBlobUrl appends an extension given without a dot", () => {
  assertEquals(buildBlobUrl(testServerUrl, testHash, "png"), `https://blossom.example.com/${testHash}.png`)
})

Deno.test("buildBlobUrl appends an extension given with a dot", () => {
  assertEquals(buildBlobUrl(testServerUrl, testHash, ".png"), `https://blossom.example.com/${testHash}.png`)
})

Deno.test("buildBlobUrl treats an empty extension as none", () => {
  assertEquals(buildBlobUrl(testServerUrl, testHash, ""), `https://blossom.example.com/${testHash}`)
})

Deno.test("extractSha256FromUrl reads a bare hash path", () => {
  const result = extractSha256FromUrl(`https://blossom.example.com/${testHash}`)
  assert(result !== null)
  assertEquals(result, testHash)
})

Deno.test("extractSha256FromUrl ignores extension, nested path, and query", () => {
  const result = extractSha256FromUrl(`https://cdn.example.com/media/${testHash}.png?size=large`)
  assert(result !== null)
  assertEquals(result, testHash)
})

Deno.test("extractSha256FromUrl lowercases an uppercase hash", () => {
  const result = extractSha256FromUrl(`https://blossom.example.com/${"A".repeat(64)}`)
  assert(result !== null)
  assertEquals(result, testHash)
})

Deno.test("extractSha256FromUrl takes the last hash segment in the path", () => {
  const result = extractSha256FromUrl(`https://blossom.example.com/${"b".repeat(64)}/${testHash}.webp`)
  assert(result !== null)
  assertEquals(result, testHash)
})

Deno.test("extractSha256FromUrl returns null when no segment carries a hash", () => {
  const result = extractSha256FromUrl("https://blossom.example.com/list/somebody")
  assertEquals(result, null)
})

Deno.test("extractSha256FromUrl returns null for an unparseable URL", () => {
  const result = extractSha256FromUrl("not a url")
  assertEquals(result, null)
})

Deno.test("buildFallbackUrls lists the original, its origin's flat URL, and each server", () => {
  const mirrorResult = createServerUrl("https://mirror.example.com")
  assert(mirrorResult !== null)

  const urls = buildFallbackUrls(`https://cdn.example.com/media/${testHash}.png?size=large`, [mirrorResult])

  assertEquals(urls, [
    `https://cdn.example.com/media/${testHash}.png?size=large`,
    `https://cdn.example.com/${testHash}.png`,
    `https://mirror.example.com/${testHash}.png`,
  ])
})

Deno.test("buildFallbackUrls collapses a server matching the original origin", () => {
  const urls = buildFallbackUrls(`https://blossom.example.com/${testHash}`, [testServerUrl])

  assertEquals(urls, [`https://blossom.example.com/${testHash}`])
})

Deno.test("buildFallbackUrls offers no alternatives for a URL addressing no hash", () => {
  const urls = buildFallbackUrls("https://example.com/photo.png", [testServerUrl])

  assertEquals(urls, ["https://example.com/photo.png"])
})
