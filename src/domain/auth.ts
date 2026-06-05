import type { UnsignedEvent } from "@innis/nostr-core"
import { now } from "@innis/nostr-core"
import type { AuthAction, Sha256 } from "./types.ts"
import { BLOSSOM_AUTH_EVENT_KIND } from "./types.ts"

export const BLOSSOM_AUTH_EXPIRATION_SECONDS = 60

interface AuthEventInput {
  readonly action: AuthAction
  readonly content: string
  readonly expiration?: number
  readonly createdAt?: number
  readonly hashes?: ReadonlyArray<Sha256>
}

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
