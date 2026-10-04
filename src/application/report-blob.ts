import type { HttpRequest, Result } from "@innis/nostr-core"
import { ok, serialiseEvent } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { ReportType, ServerUrl, Sha256 } from "../domain/types.ts"
import { createUnsignedReportEvent } from "../domain/report.ts"
import type { BlossomDeps } from "./ports.ts"

interface ReportBlobInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly reportType: ReportType
  readonly reason: string
  readonly signal?: AbortSignal | undefined
}

/** Build the report use-case (BUD-09): sign a kind-1984 NIP-56 report and `PUT` it to `/report` as the request body. This endpoint takes no kind-24242 auth header; it is a server-side report, not a Nostr-relay publish. Resolves to `void` on success. */
export const createReportBlob = (
  deps: BlossomDeps,
): (input: ReportBlobInput) => Promise<Result<void, BlossomFailure>> => {
  return async (input) => {
    const signResult = await deps.signer.signEvent(createUnsignedReportEvent(input))
    if (!signResult.success) return signResult

    const request: HttpRequest = {
      url: `${input.serverUrl}/report`,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: serialiseEvent(signResult.value),
      signal: input.signal,
    }

    const response = await deps.httpClient.request(request)
    if (!response.success) return response

    return ok(undefined)
  }
}
