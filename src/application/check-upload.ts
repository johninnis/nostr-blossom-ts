import type { Result } from "@innis/nostr-core"
import { ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { ServerUrl, Sha256, UploadEndpoint } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"

interface CheckUploadInput {
  readonly serverUrl: ServerUrl
  readonly sha256: Sha256
  readonly size: number
  readonly contentType: string
  readonly endpoint?: UploadEndpoint | undefined
  readonly signal?: AbortSignal | undefined
}

/**
 * The server's answer to an upload pre-flight (BUD-06, or BUD-05 for `media`). `accepted`: the upload would succeed. `rejected`: the
 * server would refuse it, with its HTTP `status` and `reason` (the `X-Reason` header, else the body).
 * `unsupported`: the server does not implement the pre-flight (it answered 404, 405 or 501), which says nothing
 * about whether the upload would succeed — attempt it and let the upload decide.
 */
export type CheckUploadOutcome =
  | { readonly verdict: "accepted" }
  | { readonly verdict: "rejected"; readonly status: number; readonly reason: string }
  | { readonly verdict: "unsupported"; readonly status: number }

// Deliberate: a server without the optional pre-flight answers with an outcome, not a failure — see ADR-0006
const CHECK_UNSUPPORTED_STATUSES: ReadonlySet<number> = new Set([404, 405, 501])

/**
 * Build the check-upload use-case: `HEAD /upload` (BUD-06), or `HEAD /media` (BUD-05) when `endpoint` is `"media"`,
 * with `X-SHA-256`/`X-Content-Length`/`X-Content-Type` headers and a token of the same verb, asking whether the
 * upload would be accepted before sending the body. Every HTTP answer resolves to a {@link CheckUploadOutcome}; only
 * a signing or transport fault is a `Failure`.
 */
export const createCheckUpload = (
  deps: BlossomDeps,
): (input: CheckUploadInput) => Promise<Result<CheckUploadOutcome, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const endpoint = input.endpoint ?? "upload"
    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: endpoint,
      content: endpoint === "media" ? "Check Media" : "Check Upload",
      method: "HEAD",
      path: `/${endpoint}`,
      headers: {
        "X-SHA-256": input.sha256,
        "X-Content-Length": String(input.size),
        "X-Content-Type": input.contentType,
      },
      hashes: [input.sha256],
      signal: input.signal,
    })

    if (response.success) return ok({ verdict: "accepted" })
    if (response.error.type !== "server") return response
    const { status, message } = response.error
    if (CHECK_UNSUPPORTED_STATUSES.has(status)) return ok({ verdict: "unsupported", status })
    return ok({ verdict: "rejected", status, reason: message })
  }
}
