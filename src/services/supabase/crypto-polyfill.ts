import * as ExpoCrypto from 'expo-crypto';

/**
 * React Native (Hermes) has no WebCrypto. Without it supabase-js builds the PKCE
 * verifier with Math.random() and sends it as a "plain" challenge. This supplies
 * the two pieces it needs, backed by the platform's secure APIs via expo-crypto:
 * crypto.getRandomValues and crypto.subtle.digest('SHA-256', …).
 * Existing implementations are never replaced.
 */
type CryptoShim = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: { digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer> };
};

const target = globalThis as unknown as { crypto?: CryptoShim };
const cryptoObject: CryptoShim = target.crypto ?? {};

if (typeof cryptoObject.getRandomValues !== 'function') {
  cryptoObject.getRandomValues = (array) => ExpoCrypto.getRandomValues(array as never) as typeof array;
}

if (typeof cryptoObject.subtle?.digest !== 'function') {
  cryptoObject.subtle = {
    ...cryptoObject.subtle,
    digest: async (algorithm, data) => {
      const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
      if (name.toUpperCase() !== 'SHA-256') throw new Error(`crypto.subtle.digest: unsupported algorithm ${name}`);
      return ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data);
    },
  };
}

if (!target.crypto) target.crypto = cryptoObject;
