import type { Result } from "@innis/nostr-core"
import type { HttpRequest, HttpResponse } from "@innis/nostr-core"
import { encodeAuthHeader } from "@innis/nostr-core"
import type { BlossomError } from "../domain/errors.ts"
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
}

export const createAuthorisedRequest = (
  deps: BlossomDeps,
): (input: AuthorisedRequestInput) => Promise<Result<HttpResponse, BlossomError>> => {
  const { signer, httpClient } = deps

  return async (input) => {
    const unsigned = createUnsignedAuthEvent({
      action: input.action,
      content: input.content,
      hashes: input.hashes,
    })

    const signResult = await signer.sign(unsigned)
    if (!signResult.success) return signResult

    const request: HttpRequest = {
      url: `${input.serverUrl}${input.path}`,
      method: input.method,
      headers: {
        ...input.headers,
        Authorization: encodeAuthHeader(signResult.value),
      },
      body: input.body,
    }

    return httpClient.request(request)
  }
}
