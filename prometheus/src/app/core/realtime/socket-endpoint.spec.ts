import { resolveSocketEndpoint } from './socket-endpoint';

describe('resolveSocketEndpoint', () => {
  it('uses the backend origin and default Socket.IO path for local development', () => {
    expect(resolveSocketEndpoint('http://localhost:3100/', 'http://localhost:4300')).toEqual({
      origin: 'http://localhost:3100',
      path: '/socket.io',
    });
  });

  it('keeps the /api prefix for same-origin App Platform routing', () => {
    expect(resolveSocketEndpoint('/api/', 'https://prometheus-staging.example.com')).toEqual({
      origin: 'https://prometheus-staging.example.com',
      path: '/api/socket.io',
    });
  });
});
