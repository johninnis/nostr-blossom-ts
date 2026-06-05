import type { Signer } from "@innis/nostr-core"
import { failure, ok, SigningError } from "@innis/nostr-core"
import type { BlossomSigner } from "../application/ports.ts"

/** Adapt a throwing `@innis/nostr-core` `Signer` into the `Result`-returning {@link BlossomSigner} the use-cases expect. This is the library's single infrastructure boundary — the one place a thrown signing error becomes a `Failure(SigningError)`. */
export const adaptSigner = (signer: Signer): BlossomSigner => ({
  sign: async (event) => {
    try {
      return ok(await signer.signEvent(event))
    } catch (error) {
      return failure(new SigningError(error instanceof Error ? error.message : "Failed to sign event"))
    }
  },
})
