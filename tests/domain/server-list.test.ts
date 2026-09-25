import { assert, assertEquals, assertStrictEquals } from "@std/assert"
import type { Tag } from "@innis/nostr-core"
import type { ServerUrl } from "../../src/domain/types.ts"
import { createServerUrl } from "../../src/domain/blob.ts"
import { addServerTag, parseServerList, removeServerTag } from "../../src/domain/server-list.ts"

Deno.test("parseServerList brands server tags in preference order", () => {
  const tags: Array<Tag> = [
    ["server", "https://a.example.com"],
    ["server", "https://b.example.com"],
  ]
  const result = parseServerList(tags)
  assertEquals(result.length, 2)
  assertEquals(result[0], "https://a.example.com")
  assertEquals(result[1], "https://b.example.com")
})

Deno.test("parseServerList skips invalid origins and non-server tags", () => {
  const tags: Array<Tag> = [
    ["server", "not a url"],
    ["r", "https://relay.example.com"],
    ["server", "ftp://wrong.example.com"],
    ["server", "https://good.example.com"],
  ]
  const result = parseServerList(tags)
  assertEquals(result.length, 1)
  assertEquals(result[0], "https://good.example.com")
})

Deno.test("parseServerList collapses duplicate origins to first occurrence", () => {
  const tags: Array<Tag> = [
    ["server", "https://dup.example.com"],
    ["server", "https://dup.example.com/"],
  ]
  const result = parseServerList(tags)
  assertEquals(result.length, 1)
  assertEquals(result[0], "https://dup.example.com")
})

Deno.test("parseServerList returns an empty list when there are no server tags", () => {
  const result = parseServerList([["r", "https://relay.example.com"]])
  assertEquals(result.length, 0)
})

const mediaResult = createServerUrl("https://media.example")
assert(mediaResult.success)
const MEDIA: ServerUrl = mediaResult.value

Deno.test("addServerTag appends a server tag when the server is not listed", () => {
  const tags: Array<Tag> = [["server", "https://other.example"]]
  assertEquals(addServerTag(tags, MEDIA), [["server", "https://other.example"], ["server", MEDIA]])
})

Deno.test("addServerTag returns the same tags when a tag names the server with a trailing slash or uppercase host", () => {
  const tags: Array<Tag> = [["server", "https://Media.Example/"]]
  assertStrictEquals(addServerTag(tags, MEDIA), tags)
})

Deno.test("removeServerTag drops tags naming the server with a trailing slash or uppercase host, keeping the rest in order", () => {
  const tags: Array<Tag> = [
    ["server", "https://Media.Example/"],
    ["server", "https://other.example"],
    ["client", "x"],
    ["server", MEDIA],
  ]
  assertEquals(removeServerTag(tags, MEDIA), [["server", "https://other.example"], ["client", "x"]])
})

Deno.test("removeServerTag returns the same tags when no tag names the server", () => {
  const tags: Array<Tag> = [["server", "https://other.example"], ["r", MEDIA]]
  assertStrictEquals(removeServerTag(tags, MEDIA), tags)
})
