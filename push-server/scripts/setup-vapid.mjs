// Generates a VAPID key pair and stores the private key as the Worker secret VAPID_PRIVATE_JWK.
// The private key only travels through wrangler's stdin: it is never printed or written to disk.
// Usage (inside push-server/, after `npx wrangler login`): node scripts/setup-vapid.mjs
//
// Running this again ROTATES the keys: every existing push subscription stops working
// until the app subscribes again with the new public key.
import { spawn } from 'node:child_process';

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const { kty, crv, x, y, d } = await crypto.subtle.exportKey('jwk', privateKey);
const publicKeyB64u = Buffer.from(await crypto.subtle.exportKey('raw', publicKey)).toString('base64url');

// shell is needed on Windows to run npx.cmd; the arguments are fixed strings.
const child = spawn('npx', ['wrangler', 'secret', 'put', 'VAPID_PRIVATE_JWK'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: process.platform === 'win32',
});
child.stdin.end(JSON.stringify({ kty, crv, x, y, d }));

child.on('error', (err) => {
  console.error('Could not run wrangler:', err.message);
  process.exit(1);
});
child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`wrangler secret put failed (exit code ${code}). Nothing was stored.`);
    process.exit(code ?? 1);
  }
  console.log('\nVAPID public key (safe to share; also served at GET /vapid-public-key):');
  console.log(publicKeyB64u);
});
