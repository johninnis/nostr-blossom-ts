import type { Tag } from "@innis/nostr-core"
import { extractTagValues } from "@innis/nostr-core"
import { createServerUrl } from "./blob.ts"
import type { ServerUrl } from "./types.ts"

/**
 * Parse a user's BUD-03 Blossom server list (the `server` tags of a kind-10063
 * `KIND_BLOSSOM_SERVER_LIST` event) into validated, preference-ordered {@link ServerUrl}s. Each
 * `server` tag value is branded through {@link createServerUrl}; entries that are not valid http/https
 * origins are skipped, and duplicate origins are collapsed to their first occurrence. Pass the event's
 * `tags`; non-`server` tags are ignored. This is the single validated path from a server-list event to
 * a usable list of servers — use it instead of reading the tags by hand.
 */
export const parseServerList = (tags: ReadonlyArray<Tag>): ReadonlyArray<ServerUrl> => {
  const servers: Array<ServerUrl> = []
  const seen = new Set<string>()
  for (const raw of extractTagValues(tags, "server")) {
    const parsed = createServerUrl(raw)
    if (parsed.success && !seen.has(parsed.value)) {
      seen.add(parsed.value)
      servers.push(parsed.value)
    }
  }
  return servers
}
