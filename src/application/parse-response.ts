import type { HttpResponse, Result } from "@innis/nostr-core"
import { failure, ok } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"

/** Internal: read a successful response's JSON body and run it through a domain parser, short-circuiting on an HTTP failure or a body-stream failure; a body that is not JSON, or that the parser rejects, is a `malformed Blossom <what>` validation failure. */
export const parseJsonResponse = async <T>(
  response: Result<HttpResponse, BlossomFailure>,
  parse: (value: unknown) => T | null,
  what: string,
): Promise<Result<T, BlossomFailure>> => {
  if (!response.success) return response
  const malformed = failure({ type: "validation", message: `malformed Blossom ${what}` } as const)
  const json = await response.value.json()
  if (!json.success) return json.error.type === "malformed-body" ? malformed : failure(json.error)
  const parsed = parse(json.value)
  return parsed === null ? malformed : ok(parsed)
}
