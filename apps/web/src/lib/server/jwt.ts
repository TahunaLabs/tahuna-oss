import { createHmac } from 'node:crypto';
import { cookieName, cookieSecure, jwtAudience, jwtIssuer, jwtSecret, jwtTTLSeconds } from './config';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function issueJWT(userID: string): { token: string; cookieName: string; maxAge: number; secure: boolean } {
  const now = Math.floor(Date.now() / 1000);
  const ttl = jwtTTLSeconds();

  const encodedHeader = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const encodedPayload = base64url(
    JSON.stringify({
      sub: userID,
      iss: jwtIssuer(),
      aud: jwtAudience(),
      iat: now,
      exp: now + ttl
    })
  );
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', jwtSecret()).update(signingInput).digest('base64url');

  return {
    token: `${signingInput}.${signature}`,
    cookieName: cookieName(),
    maxAge: ttl,
    secure: cookieSecure()
  };
}
