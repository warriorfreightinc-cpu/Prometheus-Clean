export type SocketEndpoint = {
  origin: string;
  path: string;
};

export function resolveSocketEndpoint(apiBaseUrl: string, browserOrigin = 'http://localhost'): SocketEndpoint {
  const baseUrl = /^https?:\/\//i.test(apiBaseUrl)
    ? new URL(apiBaseUrl)
    : new URL(apiBaseUrl || '/', browserOrigin);
  const prefix = baseUrl.pathname.replace(/\/+$/g, '');

  return {
    origin: baseUrl.origin,
    path: `${prefix || ''}/socket.io`,
  };
}
