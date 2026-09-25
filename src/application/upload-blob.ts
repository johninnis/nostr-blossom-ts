import type { Result } from "@innis/nostr-core"
import { failure, ServerError } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import { computeSha256, parseBlobDescriptor } from "../domain/blob.ts"
import type { BlobDescriptor, ServerUrl } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { createCheckUpload } from "./check-upload.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface UploadInput {
  readonly serverUrl: ServerUrl
  readonly file: File
  readonly endpoint?: "upload" | "media"
  readonly check?: boolean
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

type UploadFn = (input: UploadInput) => Promise<Result<BlobDescriptor, BlossomError>>

/**
 * Build the upload use-case: hash a `File`, sign an `upload`/`media` auth event, and `PUT` it to `/upload`
 * (or `/media` when `input.endpoint === "media"`). Resolves to the stored {@link BlobDescriptor}.
 *
 * With `check: true` a BUD-06 check (see {@link createCheckUpload}) runs first with the same hash, size
 * and content type: a `rejected` verdict fails with a `ServerError` carrying the server's status and
 * reason before any bytes are sent; an `unsupported` verdict is not a failure — the upload proceeds and
 * decides.
 */
export const createUpload = (deps: BlossomDeps): UploadFn => {
  const authorisedRequest = createAuthorisedRequest(deps)
  const checkUpload = createCheckUpload(deps)

  return async (input) => {
    const endpoint = input.endpoint ?? "upload"
    const contentType = input.file.type || "application/octet-stream"
    const buffer = await input.file.arrayBuffer()
    const hashResult = await computeSha256(buffer)
    if (!hashResult.success) return hashResult
    const sha256 = hashResult.value

    if (input.check === true) {
      const checked = await checkUpload({
        serverUrl: input.serverUrl,
        sha256,
        size: buffer.byteLength,
        contentType,
        timeoutMs: input.timeoutMs,
        signal: input.signal,
      })
      if (!checked.success) return checked
      if (checked.value.verdict === "rejected") {
        return failure(new ServerError(checked.value.status, checked.value.reason))
      }
    }

    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: endpoint,
      content: endpoint === "media" ? "Upload Media" : "Upload Blob",
      method: "PUT",
      path: `/${endpoint}`,
      headers: {
        "Content-Type": contentType,
        "X-SHA-256": sha256,
      },
      body: buffer,
      hashes: [sha256],
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    })

    return parseJsonResponse(response, parseBlobDescriptor)
  }
}
