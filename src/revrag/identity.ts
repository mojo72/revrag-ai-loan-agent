// RevRag configuration shared by the SDK integration and the voice session.

export const REVRAG_API_KEY = import.meta.env.VITE_REVRAG_API_KEY as string | undefined;

/** Same backend the official SDK talks to (`@revrag-ai/embed-react` defaults to it). */
export const REVRAG_BASE = 'https://embed.revrag.ai';

/** Anonymous, stable per-browser customer id used for USER_DATA, events and the call. */
export function appUserId(): string {
  try {
    let id = localStorage.getItem('bliss-user-id');
    if (!id) {
      id = 'guest-' + crypto.randomUUID().slice(0, 8);
      localStorage.setItem('bliss-user-id', id);
    }
    return id;
  } catch {
    return 'guest-anon';
  }
}
