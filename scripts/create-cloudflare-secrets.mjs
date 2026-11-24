import crypto from 'node:crypto';
import fs from 'node:fs';

const secrets = {
  LOGIN_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  SESSION_SECRET: crypto.randomBytes(48).toString('base64url'),
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/cloudflare-secrets.json', `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync('.dev.vars', `LOGIN_PASSWORD=${secrets.LOGIN_PASSWORD}\nSESSION_SECRET=${secrets.SESSION_SECRET}\n`, { mode: 0o600 });
console.log(`Senha inicial do sistema: ${secrets.LOGIN_PASSWORD}`);
