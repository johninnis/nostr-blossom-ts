import { assertEquals } from "@std/assert"
import type { Tag } from "@innis/nostr-core"
import { parseServerList } from "../../src/domain/server-list.ts"

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
