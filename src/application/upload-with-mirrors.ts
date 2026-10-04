import type { Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import type { BlobDescriptor, ServerUrl, UploadEndpoint } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createUpload } from "./upload-blob.ts"
import type { ServerOutcome } from "./server-outcomes.ts"
import { createMirrorToServers } from "./mirror-to-servers.ts"

interface UploadWithMirrorsInput {
  readonly servers: ReadonlyArray<ServerUrl>
  readonly file: File
  readonly endpoint?: UploadEndpoint
  readonly check?: boolean
  readonly signal?: AbortSignal | undefined
}

/** The result of {@link createUploadWithMirrors}: the descriptor the primary server stored, and a {@link ServerOutcome} for each remaining server asked to mirror it. */
export interface UploadWithMirrorsReport {
  readonly blob: BlobDescriptor
  readonly mirrors: ReadonlyArray<ServerOutcome<BlobDescriptor>>
}

/**
 * Build the upload-with-mirrors use-case: upload the file to the first of `servers` (the user's
 * BUD-03 preferred server), then ask every remaining server, concurrently, to mirror the stored
 * blob. Only the primary upload decides success — a failed mirror leaves the blob available and is
 * reported in the {@link UploadWithMirrorsReport}'s `mirrors` for the caller to surface or retry.
 * An empty server list is a `ValidationFailure`. `check: true` runs the endpoint's pre-flight against the
 * primary before its upload, as {@link createUpload} does; mirrors receive the blob only after the primary
 * has accepted it.
 */
export const createUploadWithMirrors = (
  deps: BlossomDeps,
): (input: UploadWithMirrorsInput) => Promise<Result<UploadWithMirrorsReport, BlossomFailure>> => {
  const upload = createUpload(deps)
  const mirrorToServers = createMirrorToServers(deps)

  return async (input) => {
    const [primary, ...rest] = input.servers
    if (primary === undefined) {
      return failure({ type: "validation", message: "at least one server is required" })
    }

    const uploaded = await upload({
      serverUrl: primary,
      file: input.file,
      endpoint: input.endpoint,
      check: input.check,
      signal: input.signal,
    })
    if (!uploaded.success) return uploaded

    const mirrors = await mirrorToServers({
      servers: rest,
      sourceUrl: uploaded.value.url,
      sha256: uploaded.value.sha256,
      signal: input.signal,
    })

    return ok({ blob: uploaded.value, mirrors })
  }
}
