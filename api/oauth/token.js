/**
 * Google OAuth code exchange.
 *
 * The browser completes the authorization-code flow with PKCE and posts the code here;
 * this function holds the client secret (server-side only) and returns an access token.
 * The secret never reaches the bundle.
 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const code = String(body.code || '');
  const codeVerifier = String(body.codeVerifier || '');
  const redirectUri = String(body.redirectUri || '');

  if (!code || !codeVerifier || !redirectUri) {
    return res.status(400).json({
      error: 'missing_parameters',
      message: 'code, codeVerifier dan redirectUri wajib.',
    });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({
      error: 'oauth_not_configured',
      message:
        'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET belum diset di environment Vercel.',
    });
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));

    if (!tokenRes.ok || !tokenData.access_token) {
      return res.status(tokenRes.status === 200 ? 400 : tokenRes.status).json({
        error: tokenData.error || 'token_exchange_failed',
        message: tokenData.error_description || 'Google menolak penukaran kode otorisasi.',
      });
    }

    let email = '';
    try {
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        email = typeof info?.email === 'string' ? info.email : '';
      }
    } catch {
      // email is cosmetic; the token is what matters
    }

    return res.status(200).json({
      access_token: tokenData.access_token,
      expires_in: Number(tokenData.expires_in) || 3600,
      scope: tokenData.scope || '',
      email,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'token_exchange_error',
      message: error?.message || 'Gagal menghubungi Google.',
    });
  }
}
