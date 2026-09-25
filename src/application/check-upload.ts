import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import type { ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface CheckUploadInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly size: number
  readonly contentType: string
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

/**
 * The server's answer to a BUD-06 upload check. `accepted`: the upload would succeed. `rejected`: the
 * server would refuse it, with its HTTP `status` and `reason` (the `X-Reason` header, else the body).
 * `unsupported`: the server does not implement BUD-06 (it answered 404, 405 or 501), which says nothing
 * about whether the upload would succeed — attempt it and let the upload decide.
 */
export type CheckUploadOutcome =
  | { readonly verdict: "accepted" }
  | { readonly verdict: "rejected"; readonly status: number; readonly reason: string }
  | { readonly verdict: "unsupported"; readonly status: number }

const CHECK_UNSUPPORTED_STATUSES: ReadonlySet<number> = new Set([404, 405, 501])

/**
 * Build the check-upload use-case (BUD-06): `HEAD /upload` with `X-SHA-256`/`X-Content-Length`/`X-Content-Type`
 * headers, asking whether an upload would be accepted before sending the body. Every HTTP answer resolves
 * to a {@link CheckUploadOutcome}; only a signing or transport fault is a `Failure`.
 */
export const createCheckUpload = (
  deps: BlossomDeps,
): (input: CheckUploadInput) => Promise<Result<CheckUploadOutcome, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "upload",
      content: "Check Upload",
      method: "HEAD",
      path: "/upload",
      headers: {
        "X-SHA-256": input.sha256,
        "X-Content-Length": String(input.size),
        "X-Content-Type": input.contentType,
      },
      hashes: [input.sha256],
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })

    if (response.success) return ok({ verdict: "accepted" })
    if (response.error.tag !== "ServerError") return response
    const { status, message } = response.error
    if (CHECK_UNSUPPORTED_STATUSES.has(status)) return ok({ verdict: "unsupported", status })
    return ok({ verdict: "rejected", status, reason: message })
  }
}
