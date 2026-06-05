import { assert, assertEquals } from "@std/assert"
import { now } from "@innis/nostr-core"
import { createUnsignedReportEvent } from "../../src/domain/report.ts"
import { createSha256 } from "../../src/domain/blob.ts"
import { REPORT_EVENT_KIND } from "../../src/domain/types.ts"

const hashResult = createSha256("a".repeat(64))
assert(hashResult.success)
const testHash = hashResult.value

Deno.test("createUnsignedReportEvent builds a NIP-56 kind 1984 event", () => {
  const event = createUnsignedReportEvent({ sha256: testHash, reportType: "illegal", reason: "stolen" })

  assertEquals(event.kind, REPORT_EVENT_KIND)
  assertEquals(event.content, "stolen")
  assert(event.created_at <= now())
})

Deno.test("createUnsignedReportEvent tags the blob hash with the report type", () => {
  const event = createUnsignedReportEvent({ sha256: testHash, reportType: "malware", reason: "" })

  assertEquals(event.tags, [["x", testHash, "malware"]])
})

Deno.test("createUnsignedReportEvent pins created_at when provided", () => {
  const event = createUnsignedReportEvent({ sha256: testHash, reportType: "spam", reason: "", createdAt: 42 })

  assertEquals(event.created_at, 42)
})
