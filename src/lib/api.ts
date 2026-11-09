// Thin JSON client. Errors carry the API's closed code (for example "item_unavailable") for the message table.
export class ApiError extends Error {
  status: number;
  code: string;
  extra: Record<string, any>;
  constructor(status: number, code: string, extra: Record<string, any> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 20000);
  try {
    const init: RequestInit = { method, credentials: 'same-origin', signal: ctrl.signal, headers: {} };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error || 'request_failed', data);
    return data as T;
  } catch (e: any) {
    if (e instanceof ApiError) throw e;
    if (e?.name === 'AbortError') throw new ApiError(0, 'timeout');
    throw new ApiError(0, 'network');
  } finally {
    window.clearTimeout(timer);
  }
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});

const MESSAGES: Record<string, string> = {
  item_unavailable: 'One of those dishes is sold out right now. Take it out of the order and try again.',
  table_not_found: 'This table code is not on the list. Ask the staff for a new QR.',
  cart_invalid: 'Something in the order did not check out. Refresh the menu and try again.',
  no_open_bill: 'There is no open bill at this table yet. Place an order first.',
  split_mode_locked: 'This bill is already split a different way. Ask the staff to reopen it.',
  already_split: 'This bill is already split equally.',
  claim_exceeds_remaining: 'More than the ordered quantity is left for that dish.',
  claim_duplicate_line: 'Each dish can be claimed once per share.',
  claim_unknown_item: 'That dish is not on this bill any more. Refresh and try again.',
  claim_empty: 'Pick at least one dish for this share.',
  split_invalid: 'Choose between 2 and 10 people.',
  sign_in_required: 'Please sign in with a staff account.',
  role_not_allowed: 'Your account does not have this screen.',
  invalid_login: 'That email and password did not match. Check them and try again.',
  too_many_attempts: 'Too many tries from this email. Wait 15 minutes, or use a demo sign-in.',
  bad_transition: 'That ticket has already moved on. The screen will refresh.',
  bill_not_open: 'This bill is already closed.',
  already_paid: 'That share is already marked paid.',
  json_required: 'The app could not send that request. Refresh the page and try again.',
  network: 'No connection to the restaurant system. Check your signal and try again.',
  timeout: 'The request took too long. Try again.',
  code_taken: 'That table code is already used.',
  email_taken: 'That email already has a staff account.',
  server_error: 'Something went wrong on our side. Try again in a moment.',
};
export function messageFor(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] || 'Something did not work. Try again.';
  return 'Something did not work. Try again.';
}
