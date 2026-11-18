/**
 * Browser `fetch` throws a bare `TypeError: Failed to fetch` for both a dead network and a
 * blocked CORS request, with no distinguishing detail. Both LLM providers call a third-party
 * endpoint directly from the browser (client-side BYOK), so both need this translated into an
 * actionable message instead of surfacing the opaque TypeError to the chat UI.
 */
export async function fetchOrThrow(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return url;
      }
    })();
    throw new Error(
      `Could not reach ${host}. The browser blocked or failed the request (network issue, or the endpoint does not allow direct browser calls). Try a CORS-enabled Base URL, such as a local OpenAI-compatible server.`
    );
  }
}
