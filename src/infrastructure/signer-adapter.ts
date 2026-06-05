import type { Signer } from "@innis/nostr-core"
import { failure, ok, SigningError } from "@innis/nostr-core"
import type { BlossomSigner } from "../application/ports.ts"

export const adaptSigner = (signer: Signer): BlossomSigner => ({
  sign: async (event) => {
    try {
      return ok(await signer.signEvent(event))
    } catch (error) {
      return failure(new SigningError(error instanceof Error ? error.message : "Failed to sign event"))
    }
  },
})
