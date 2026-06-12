import type { Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import { computeSha256, parseBlobDescriptor } from "../domain/blob.ts"
import type { BlobDescriptor, ServerUrl } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface UploadInput {
  readonly serverUrl: ServerUrl
  readonly file: File
  readonly endpoint?: "upload" | "media"
  readonly timeoutMs?: number
  readonly signal?: AbortSignal
}

type UploadFn = (input: UploadInput) => Promise<Result<BlobDescriptor, BlossomError>>

/** Build the upload use-case: hash a `File`, sign an `upload`/`media` auth event, and `PUT` it to `/upload` (or `/media` when `input.endpoint === "media"`). Resolves to the stored {@link BlobDescriptor}. */
export const createUpload = (deps: BlossomDeps): UploadFn => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const endpoint = input.endpoint ?? "upload"
    const buffer = await input.file.arrayBuffer()
    const hashResult = await computeSha256(buffer)
    if (!hashResult.success) return hashResult
    const sha256 = hashResult.value

    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: endpoint,
      content: endpoint === "media" ? "Upload Media" : "Upload Blob",
      method: "PUT",
      path: `/${endpoint}`,
      headers: {
        "Content-Type": input.file.type || "application/octet-stream",
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
