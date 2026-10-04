import type { Result } from "@innis/nostr-core"
import { failure } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import { computeSha256, parseBlobDescriptor } from "../domain/blob.ts"
import type { BlobDescriptor, ServerUrl, UploadEndpoint } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { createCheckUpload } from "./check-upload.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface UploadInput {
  readonly serverUrl: ServerUrl
  readonly file: File
  readonly endpoint?: UploadEndpoint | undefined
  readonly check?: boolean | undefined
  readonly signal?: AbortSignal | undefined
}

/**
 * Build the upload use-case: hash a `File`, sign an `upload`/`media` auth event, and `PUT` it to `/upload`
 * (or `/media` when `input.endpoint === "media"`). Resolves to the stored {@link BlobDescriptor}.
 *
 * With `check: true` the endpoint's pre-flight (see {@link createCheckUpload}) runs first with the same hash, size
 * and content type: a `rejected` verdict fails with a `ServerFailure` carrying the server's status and
 * reason before any bytes are sent; an `unsupported` verdict is not a failure — the upload proceeds and
 * decides.
 */
export const createUpload = (
  deps: BlossomDeps,
): (input: UploadInput) => Promise<Result<BlobDescriptor, BlossomFailure>> => {
  const authorisedRequest = createAuthorisedRequest(deps)
  const checkUpload = createCheckUpload(deps)

  return async (input) => {
    const endpoint = input.endpoint ?? "upload"
    const contentType = input.file.type || "application/octet-stream"
    const buffer = await input.file.arrayBuffer()
    const sha256 = computeSha256(buffer)

    if (input.check === true) {
      const checked = await checkUpload({
        serverUrl: input.serverUrl,
        sha256,
        size: buffer.byteLength,
        contentType,
        endpoint,
        signal: input.signal,
      })
      if (!checked.success) return checked
      if (checked.value.verdict === "rejected") {
        return failure({ type: "server", status: checked.value.status, message: checked.value.reason })
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
      signal: input.signal,
    })

    return parseJsonResponse(response, parseBlobDescriptor, "blob descriptor")
  }
}
