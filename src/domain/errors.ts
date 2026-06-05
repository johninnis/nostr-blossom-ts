import type { NetworkError, ServerError, SigningError } from "@innis/nostr-core"
import { TaggedError } from "@innis/nostr-core"

export class ValidationError extends TaggedError<"ValidationError"> {
  constructor(message: string) {
    super("ValidationError", message)
  }
}

export type BlossomError =
  | SigningError
  | ServerError
  | ValidationError
  | NetworkError
