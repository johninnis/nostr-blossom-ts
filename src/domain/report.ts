import type { UnsignedEvent } from "@innis/nostr-core"
import { now } from "@innis/nostr-core"
import type { ReportType, Sha256 } from "./types.ts"
import { REPORT_EVENT_KIND } from "./types.ts"

interface ReportInput {
  readonly sha256: Sha256
  readonly reportType: ReportType
  readonly reason: string
  readonly createdAt?: number
}

export const createUnsignedReportEvent = (input: ReportInput): UnsignedEvent => ({
  kind: REPORT_EVENT_KIND,
  content: input.reason,
  created_at: input.createdAt ?? now(),
  tags: [
    ["x", input.sha256, input.reportType],
  ],
})
