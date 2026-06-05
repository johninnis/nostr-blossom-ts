import type { HttpResponse, Result } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"

/** Internal: read a successful response's JSON body and run it through a domain parser, short-circuiting on an HTTP failure or a body-stream failure. */
export const parseJsonResponse = async <T>(
  response: Result<HttpResponse, BlossomError>,
  parse: (value: unknown) => Result<T, BlossomError>,
): Promise<Result<T, BlossomError>> => {
  if (!response.success) return response
  const json = await response.value.json()
  if (!json.success) return json
  return parse(json.value)
}
