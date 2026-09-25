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

const isServerTagFor = (tag: Tag, serverUrl: ServerUrl): boolean => {
  if (tag[0] !== "server") return false
  const parsed = createServerUrl(tag[1] ?? "")
  return parsed.success && parsed.value === serverUrl
}

/**
 * Append a `server` tag for `serverUrl` to a BUD-03 server list's tags, unless one already names it. A
 * tag names the server when it normalises through {@link createServerUrl} to the same origin, as
 * {@link parseServerList} reads it — so a tag written with a trailing slash or an uppercase host still
 * matches. Returns `tags` itself (the same reference) when the server is already listed.
 */
export const addServerTag = (tags: ReadonlyArray<Tag>, serverUrl: ServerUrl): ReadonlyArray<Tag> =>
  tags.some((tag) => isServerTagFor(tag, serverUrl)) ? tags : [...tags, ["server", serverUrl]]

/**
 * Remove every `server` tag naming `serverUrl` from a BUD-03 server list's tags, matching through
 * {@link createServerUrl} normalisation as {@link addServerTag} does. Other tags keep their order.
 * Returns `tags` itself (the same reference) when no tag names the server.
 */
export const removeServerTag = (tags: ReadonlyArray<Tag>, serverUrl: ServerUrl): ReadonlyArray<Tag> => {
  const kept = tags.filter((tag) => !isServerTagFor(tag, serverUrl))
  return kept.length === tags.length ? tags : kept
}
