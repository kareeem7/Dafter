/**
 * UUID minting for the sync core. Every mutation gets a UUID on the device;
 * that UUID is its idempotency key for the server.
 */

const FALLBACK_ALPHABET = '0123456789abcdef';

function fallbackUuid(): string {
  let out = '';
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += '-';
    } else if (i === 14) {
      out += '4';
    } else if (i === 19) {
      out += FALLBACK_ALPHABET[(Math.random() * 4) | 8];
    } else {
      out += FALLBACK_ALPHABET[(Math.random() * 16) | 0];
    }
  }
  return out;
}

export function uuid(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return fallbackUuid();
}
