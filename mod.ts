/**
 * TypeScript client for the [Blossom](https://github.com/hzrd149/blossom) media-server protocol:
 * upload, list, delete, mirror, download, head, check, and report blobs against any Blossom-compatible
 * server. SHA-256 content addressing, kind-24242 authorisation events, and kind-1984 NIP-56 reports.
 *
 * The package is branded domain primitives plus pure use-case factories over injected `BlossomSigner`
 * and `HttpClient` ports — it owns no state, performs no caching, and never calls `globalThis.fetch`.
 *
 * Beyond the single-server use-cases it orchestrates a user's BUD-03 server list: streaming
 * multi-server listing, upload-then-mirror, and hash-verified fallback downloads, plus the blob-URL
 * helpers the orchestration is built from.
 *
 * @module
 */

export type {
  AuthAction,
  BlobDescriptor,
  BlobHeaders,
  ListBlobsQuery,
  ReportType,
  ServerUrl,
  Sha256,
} from "./src/domain/types.ts"
export { BLOSSOM_AUTH_EVENT_KIND, REPORT_EVENT_KIND } from "./src/domain/types.ts"

export type { BlossomError } from "./src/domain/errors.ts"
export { ValidationError } from "./src/domain/errors.ts"

export { createUnsignedAuthEvent } from "./src/domain/auth.ts"
export { parseServerList } from "./src/domain/server-list.ts"
export { createUnsignedReportEvent } from "./src/domain/report.ts"
export { buildBlobUrl, buildFallbackUrls, extractSha256FromUrl } from "./src/domain/blob-url.ts"
export {
  buildListQueryString,
  computeSha256,
  createServerUrl,
  createSha256,
  parseBlobDescriptor,
  parseBlobDescriptorList,
} from "./src/domain/blob.ts"

export type { BlossomDeps, BlossomSigner } from "./src/application/ports.ts"
export { adaptSigner } from "./src/infrastructure/signer-adapter.ts"

export { createUpload } from "./src/application/upload-blob.ts"
export { createListBlobs } from "./src/application/list-blobs.ts"
export { createDeleteBlob } from "./src/application/delete-blob.ts"
export { createMirrorBlob } from "./src/application/mirror-blob.ts"
export { createGetBlob } from "./src/application/get-blob.ts"
export type { BlobResponse } from "./src/application/get-blob.ts"
export { createHeadBlob } from "./src/application/head-blob.ts"
export { createCheckUpload } from "./src/application/check-upload.ts"
export { createReportBlob } from "./src/application/report-blob.ts"

export { createMirrorToServers } from "./src/application/mirror-to-servers.ts"
export type { ServerOutcome } from "./src/application/mirror-to-servers.ts"
export { createUploadWithMirrors } from "./src/application/upload-with-mirrors.ts"
export type { UploadWithMirrorsReport } from "./src/application/upload-with-mirrors.ts"
export { createListBlobsAcrossServers } from "./src/application/list-across-servers.ts"
export type {
  ListAcrossServersHandle,
  ListAcrossServersUpdate,
  ServerBlob,
} from "./src/application/list-across-servers.ts"
export { createGetBlobWithFallback } from "./src/application/get-blob-with-fallback.ts"
export type { FallbackBlobResponse } from "./src/application/get-blob-with-fallback.ts"
