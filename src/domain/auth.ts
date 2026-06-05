import type { UnsignedEvent } from "@innis/nostr-core"
import { now } from "@innis/nostr-core"
import type { AuthAction, Sha256 } from "./types.ts"
import { BLOSSOM_AUTH_EVENT_KIND } from "./types.ts"

/** Default lifetime, in seconds, of a Blossom auth event's NIP-40 `expiration` tag when no explicit expiry is supplied. */
export const BLOSSOM_AUTH_EXPIRATION_SECONDS = 60

interface AuthEventInput {
  readonly action: AuthAction
  readonly content: string
  readonly expiration?: number
  readonly createdAt?: number
  readonly hashes?: ReadonlyArray<Sha256>
}

/**
 * Build the unsigned kind-24242 Blossom authorisation event (BUD-01): a `t` action tag, a NIP-40
 * `expiration` tag (defaulting to {@link BLOSSOM_AUTH_EXPIRATION_SECONDS} after `createdAt`), and an
 * `x` hash tag per entry in `hashes`. `createdAt` defaults to the system clock — pin it for
 * deterministic output. The caller signs the result via `BlossomSigner.sign`.
 */
export const createUnsignedAuthEvent = (input: AuthEventInput): UnsignedEvent => {
  const createdAt = input.createdAt ?? now()
  return {
    kind: BLOSSOM_AUTH_EVENT_KIND,
    content: input.content,
    created_at: createdAt,
    tags: [
      ["t", input.action],
      ["expiration", String(input.expiration ?? createdAt + BLOSSOM_AUTH_EXPIRATION_SECONDS)],
      ...hashTags(input.hashes),
    ],
  }
}

const hashTags = (
  hashes: ReadonlyArray<Sha256> | undefined,
): ReadonlyArray<UnsignedEvent["tags"][number]> => hashes !== undefined ? hashes.map((h) => ["x", h]) : []
