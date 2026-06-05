import { assert, assertEquals } from "@std/assert"
import {
  buildListQueryString,
  computeSha256,
  createServerUrl,
  createSha256,
  parseBlobDescriptor,
  parseBlobDescriptorList,
} from "../../src/domain/blob.ts"

const validDescriptor = {
  url: "https://blossom.example.com/abc.png",
  sha256: "a".repeat(64),
  size: 1024,
  type: "image/png",
  uploaded: 1704067200,
}

Deno.test("createSha256 accepts valid 64-char hex", () => {
  const hash = "a".repeat(64)
  const result = createSha256(hash)
  assert(result.success)
  assertEquals(result.value, hash)
})

Deno.test("createSha256 normalises to lowercase", () => {
  const hash = "A".repeat(64)
  const result = createSha256(hash)
  assert(result.success)
  assertEquals(result.value, "a".repeat(64))
})

Deno.test("createSha256 rejects short string", () => {
  const result = createSha256("abc")
  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})

Deno.test("createSha256 rejects non-hex characters", () => {
  const result = createSha256("g".repeat(64))
  assert(!result.success)
})

Deno.test("createServerUrl accepts https URL", () => {
  const result = createServerUrl("https://blossom.example.com")
  assert(result.success)
  assertEquals(result.value, "https://blossom.example.com")
})

Deno.test("createServerUrl strips trailing slashes", () => {
  const result = createServerUrl("https://blossom.example.com///")
  assert(result.success)
  assertEquals(result.value, "https://blossom.example.com")
})

Deno.test("createServerUrl accepts http URL", () => {
  const result = createServerUrl("http://localhost:3000")
  assert(result.success)
  assertEquals(result.value, "http://localhost:3000")
})

Deno.test("createServerUrl rejects ftp", () => {
  const result = createServerUrl("ftp://example.com")
  assert(!result.success)
})

Deno.test("createServerUrl rejects garbage", () => {
  const result = createServerUrl("not a url")
  assert(!result.success)
})

Deno.test("buildListQueryString empty query", () => {
  assertEquals(buildListQueryString({}), "")
})

Deno.test("buildListQueryString with all params", () => {
  const qs = buildListQueryString({ cursor: "abc", limit: 10, since: 100, until: 200 })
  assert(qs.includes("cursor=abc"))
  assert(qs.includes("limit=10"))
  assert(qs.includes("since=100"))
  assert(qs.includes("until=200"))
  assert(qs.startsWith("?"))
})

Deno.test("buildListQueryString with partial params", () => {
  const qs = buildListQueryString({ limit: 5 })
  assertEquals(qs, "?limit=5")
})

Deno.test("computeSha256 produces valid hex hash", async () => {
  const data = new TextEncoder().encode("hello world")
  const result = await computeSha256(data.buffer)
  assert(result.success)
  assertEquals(result.value.length, 64)
  assert(/^[0-9a-f]{64}$/.test(result.value))
})

Deno.test("computeSha256 produces correct known hash", async () => {
  const data = new TextEncoder().encode("hello world")
  const result = await computeSha256(data.buffer)
  assert(result.success)
  assertEquals(result.value, "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9")
})

Deno.test("computeSha256 is deterministic", async () => {
  const data = new TextEncoder().encode("test")
  const first = await computeSha256(data.buffer)
  const second = await computeSha256(data.buffer)
  assert(first.success && second.success)
  assertEquals(first.value, second.value)
})

Deno.test("parseBlobDescriptor accepts a numeric uploaded timestamp", () => {
  const result = parseBlobDescriptor(validDescriptor)
  assert(result.success)
  assertEquals(result.value.uploaded, 1704067200)
})

Deno.test("parseBlobDescriptor rejects a string uploaded timestamp", () => {
  const result = parseBlobDescriptor({ ...validDescriptor, uploaded: "2024-01-01T00:00:00Z" })
  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})

Deno.test("parseBlobDescriptorList brands every descriptor in the array", () => {
  const result = parseBlobDescriptorList([validDescriptor, { ...validDescriptor, sha256: "b".repeat(64) }])
  assert(result.success)
  assertEquals(result.value.length, 2)
  assertEquals(result.value[0]?.sha256, "a".repeat(64))
})

Deno.test("parseBlobDescriptorList rejects a non-array value", () => {
  const result = parseBlobDescriptorList(validDescriptor)
  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})

Deno.test("parseBlobDescriptorList fails on the first malformed element", () => {
  const result = parseBlobDescriptorList([validDescriptor, { ...validDescriptor, sha256: "not-hex" }])
  assert(!result.success)
  assertEquals(result.error.tag, "ValidationError")
})
