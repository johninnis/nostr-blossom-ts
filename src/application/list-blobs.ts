import type { PublicKey, Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
import { buildListQueryString, parseBlobDescriptorList } from "../domain/blob.ts"
import type { BlobDescriptor, ListBlobsQuery, ServerUrl } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"
import { createAuthorisedRequest } from "./authorised-request.ts"
import { parseJsonResponse } from "./parse-response.ts"

interface ListBlobsInput {
  readonly serverUrl: ServerUrl
  readonly pubkey: PublicKey
  readonly query?: ListBlobsQuery
}

/** Build the list use-case: `GET /list/<pubkey>` with an optional {@link ListBlobsQuery}, returning the server's blobs as a validated `ReadonlyArray<BlobDescriptor>`. */
export const createListBlobs = (
  deps: BlossomDeps,
): (input: ListBlobsInput) => Promise<Result<ReadonlyArray<BlobDescriptor>, BlossomError>> => {
  const authorisedRequest = createAuthorisedRequest(deps)

  return async (input) => {
    const queryString = input.query !== undefined ? buildListQueryString(input.query) : ""

    const response = await authorisedRequest({
      serverUrl: input.serverUrl,
      action: "list",
      content: "List Blobs",
      method: "GET",
      path: `/list/${input.pubkey}${queryString}`,
    })

    return parseJsonResponse(response, parseBlobDescriptorList)
  }
}
