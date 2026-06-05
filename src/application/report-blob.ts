import type { HttpRequest, Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { ReportType, ServerUrl, Sha256 } from "../domain/types.ts"
import { createUnsignedReportEvent } from "../domain/report.ts"
import type { BlossomDeps } from "./ports.ts"

interface ReportBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly reportType: ReportType
  readonly reason: string
}

export const createReportBlob = (
  deps: BlossomDeps,
): (input: ReportBlobInput) => Promise<Result<void, BlossomError>> => {
  return async (input) => {
    const signResult = await deps.signer.sign(createUnsignedReportEvent(input))
    if (!signResult.success) return signResult

    const request: HttpRequest = {
      url: `${input.serverUrl}/report`,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signResult.value),
    }

    const response = await deps.httpClient.request(request)
    if (!response.success) return response

    return ok(undefined)
  }
}
