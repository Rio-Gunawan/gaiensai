const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'https://gaiensai.pages.dev',
]);

export const getCorsHeaders = (req: Request): HeadersInit => {
  const origin = req.headers.get('origin');
  const allowOrigin =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'https://gaiensai.pages.dev';

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
};
