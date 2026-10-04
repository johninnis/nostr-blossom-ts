import type { HttpRequest, HttpResponse, Result } from "@innis/nostr-core"
import { encodeBlossomAuthHeader, failure } from "@innis/nostr-core"
import type { BlossomFailure } from "../domain/failure/blossom-failure.ts"
import { createUnsignedAuthEvent } from "../domain/auth.ts"
import type { AuthAction, ServerUrl, Sha256 } from "../domain/types.ts"
import type { BlossomDeps } from "./ports.ts"

interface AuthorisedRequestInput {
  readonly serverUrl: ServerUrl
  readonly action: AuthAction
  readonly content: string
  readonly method: string
  readonly path: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: BodyInit
  readonly hashes?: ReadonlyArray<Sha256>
  readonly signal?: AbortSignal | undefined
  readonly followRedirectTo?: ((url: string) => boolean) | undefined
  readonly maxBodyBytes?: number | undefined
}

/**
 * Internal: the single boundary every authenticated use-case builds on — sign the kind-24242 auth event, scoped by a
 * `server` tag to the one server the request goes to, attach it as the `Authorization: Nostr` header in BUD-11's
 * unpadded base64url, and issue the HTTP request. A private address is reached only when the injected
 * `HttpClient` reaches one: signing for a server does not make it the user's own, since `get` and `head` sign for any
 * server a blob is fetched from, other users' BUD-03 servers included. A signed auth event whose header would be longer
 * than the 4096 characters a server reads is a `validation` failure, and nothing is sent.
 */
export const createAuthorisedRequest = (
  deps: BlossomDeps,
): (input: AuthorisedRequestInput) => Promise<Result<HttpResponse, BlossomFailure>> => {
  const { signer, httpClient } = deps

  return async (input) => {
    const unsigned = createUnsignedAuthEvent({
      action: input.action,
      content: input.content,
      hashes: input.hashes,
      // Deliberate: every token names the server it is sent to, so a leaked one is worthless elsewhere — see ADR-0002
      server: input.serverUrl,
    })

    const signResult = await signer.signEvent(unsigned)
    if (!signResult.success) return signResult
    const authorization = encodeBlossomAuthHeader(signResult.value)
    if (authorization === null) {
      return failure({ type: "validation", message: "the signed auth event is longer than a server reads" })
    }

    const request: HttpRequest = {
      url: `${input.serverUrl}${input.path}`,
      method: input.method,
      headers: {
        ...input.headers,
        Authorization: authorization,
      },
      body: input.body,
      signal: input.signal,
      followRedirectTo: input.followRedirectTo,
      maxBodyBytes: input.maxBodyBytes,
    }

    return httpClient.request(request)
  }
}
