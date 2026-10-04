import { assert, assertEquals } from "@std/assert"
import { parseBlossomAuthHeader } from "@innis/nostr-core"
import { createDeleteBlob } from "../../src/application/delete-blob.ts"
import { createServerUrl, createSha256 } from "../../src/domain/blob.ts"
import { createCapturingHttpClient, createFakeSigner, createFakeSuccessResponse } from "../_helpers/fakes.ts"

const serverUrl = createServerUrl("https://Blossom.Example.com:8443")
assert(serverUrl !== null)
const sha256 = createSha256("a".repeat(64))
assert(sha256 !== null)

const sentAuthorization = async (): Promise<string> => {
  const captured = createCapturingHttpClient(createFakeSuccessResponse(200, ""))
  await createDeleteBlob({ signer: createFakeSigner(), httpClient: captured.client })({ serverUrl, sha256 })
  return captured.requests[0]?.headers?.Authorization ?? ""
}

Deno.test("an authorised request writes the token in BUD-11's unpadded base64url", async () => {
  const credentials = (await sentAuthorization()).slice("Nostr ".length)
  assert(/^[A-Za-z0-9_-]+$/.test(credentials))
})

Deno.test("an authorised request's header reads back as the signed token", async () => {
  const token = parseBlossomAuthHeader(await sentAuthorization())
  assert(token.success)
  assertEquals(token.value.kind, 24242)
})

Deno.test("an authorised request scopes its token to the domain of the server it is sent to", async () => {
  const token = parseBlossomAuthHeader(await sentAuthorization())
  assert(token.success)
  assertEquals(token.value.tags.filter((tag) => tag[0] === "server"), [["server", "blossom.example.com"]])
})
