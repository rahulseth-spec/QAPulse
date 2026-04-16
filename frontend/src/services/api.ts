const API_BASE = (() => {
  const normalize = (value: unknown) => {
    if (typeof value !== 'string') return '';
    return value.trim().replace(/\/+$/, '');
  };

  try {
    const fromEnv = normalize((import.meta as any)?.env?.VITE_API_BASE_URL);
    if (fromEnv) return fromEnv;
  } catch {}

  try {
    const fromStorage = normalize(window.localStorage.getItem('qapulse_api_base'));
    if (fromStorage) return fromStorage;
  } catch {}

  try {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === 'localhost' || host === '127.0.0.1') {
      if (port === '3000' || port === '5173' || port === '4173' || !port) {
        return 'http://localhost:4000';
      }
    }
    if (host === 'qapulse.onrender.com') return 'https://qapulsebend.onrender.com';
  } catch {}

  return '';
})();

export const apiUrl = (path: string) => {
  if (!API_BASE) return path;
  if (path.startsWith('/')) return `${API_BASE}${path}`;
  return `${API_BASE}/${path}`;
};

export const looksLikeHtml = (text: string) =>
  /<!doctype|<html[\s>]/i.test(text);

export const isRenderWakingPage = (text: string) =>
  /service waking up|incoming http request detected|steady hands|application loading|render - application loading/i.test(text);

export const readJsonOrText = async (res: Response) => {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json().catch(() => null);
    return { kind: 'json' as const, data, contentType };
  }
  const text = await res.text().catch(() => '');
  return { kind: 'text' as const, text, contentType };
};

export const fetchWithAuth = async (
  path: string,
  token: string,
  options: RequestInit = {},
  onUnauthorized?: () => void
): Promise<Response> => {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });
  if (res.status === 401) {
    onUnauthorized?.();
  }
  return res;
};
