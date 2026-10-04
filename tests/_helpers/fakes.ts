import type { HttpClient, HttpRequest, HttpResponse } from "@innis/nostr-core"
import { createLocalSigner, failure, generateSecretKey, ok, parseJson } from "@innis/nostr-core"
import type { BlossomSigner } from "../../src/application/ports.ts"

export const createFakeSigner = (): BlossomSigner => createLocalSigner(generateSecretKey())

export const createFailingSigner = (): BlossomSigner => ({
  signEvent: () => Promise.resolve(failure({ type: "sign-failed", message: "Test signing failure" })),
})

export const createFakeSuccessResponse = (
  status: number,
  body: string,
  headers?: Record<string, string>,
): HttpResponse => ({
  status,
  headers: new Headers(headers),
  json: () => {
    const parsed = parseJson(body)
    return Promise.resolve(
      parsed.success ? parsed : failure({ type: "malformed-body", message: "response body is not JSON" }),
    )
  },
  blob: () => Promise.resolve(ok(new Blob([body]))),
  text: () => Promise.resolve(ok(body)),
})

export const createFakeHttpClient = (response: HttpResponse): HttpClient => ({
  request: async () => {
    if (response.status >= 400) {
      const textResult = await response.text()
      const reason = response.headers.get("x-reason") ?? (textResult.success ? textResult.value : "")
      return failure({ type: "server", status: response.status, message: reason })
    }
    return ok(response)
  },
})

export const createCapturingHttpClient = (
  response: HttpResponse,
): { readonly client: HttpClient; readonly requests: ReadonlyArray<HttpRequest> } => {
  const requests: HttpRequest[] = []
  const base = createFakeHttpClient(response)
  return {
    requests,
    client: {
      request: (input) => {
        requests.push(input)
        return base.request(input)
      },
    },
  }
}
