import type { UnsignedEvent } from "@innis/nostr-core"
import { KIND_REPORTING, now } from "@innis/nostr-core"
import type { ReportType, Sha256 } from "./types.ts"

interface ReportInput {
  readonly sha256: Sha256
  readonly reportType: ReportType
  readonly reason: string
  readonly createdAt?: number
}

/**
 * Build the unsigned kind-1984 NIP-56 report event referencing a blob by hash
 * (`["x", <sha256>, <reportType>]`), with `reason` as the content. `createdAt` defaults to the system
 * clock. Signed and sent as the body of `PUT /report` by {@link createReportBlob}.
 */
export const createUnsignedReportEvent = (input: ReportInput): UnsignedEvent => ({
  kind: KIND_REPORTING,
  content: input.reason,
  created_at: input.createdAt ?? now(),
  tags: [
    ["x", input.sha256, input.reportType],
  ],
})
