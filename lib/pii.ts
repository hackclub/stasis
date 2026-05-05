import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "crypto";

function deriveKey(): Buffer {
  const secret = process.env.PII_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("PII_ENCRYPTION_KEY environment variable is not set");
  }
  return Buffer.from(
    hkdfSync("sha256", secret, "", "stasis-pii-encryption", 32)
  );
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a string in the format `iv:authTag:ciphertext` (all base64-encoded).
 */
export function encryptPII(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export interface DecryptedAddress {
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string | null
}

/** Decrypts the User.encryptedAddress* fields as a single address object.
 * Returns null when none of the address fields are populated. Individual
 * decryption failures (corruption, key rotation) are swallowed so a single
 * bad column doesn't take out the whole record. */
export function decryptUserAddress(user: {
  encryptedAddressStreet: string | null
  encryptedAddressCity: string | null
  encryptedAddressState: string | null
  encryptedAddressZip: string | null
  encryptedAddressCountry: string | null
}): DecryptedAddress | null {
  if (
    !user.encryptedAddressStreet &&
    !user.encryptedAddressCity &&
    !user.encryptedAddressState &&
    !user.encryptedAddressZip &&
    !user.encryptedAddressCountry
  ) return null
  const safe = (s: string | null): string | null => {
    if (!s) return null
    try { return decryptPII(s) } catch { return null }
  }
  return {
    street: safe(user.encryptedAddressStreet),
    city: safe(user.encryptedAddressCity),
    state: safe(user.encryptedAddressState),
    zip: safe(user.encryptedAddressZip),
    country: safe(user.encryptedAddressCountry),
  }
}

/**
 * Decrypts a string produced by encryptPII.
 */
export function decryptPII(encrypted: string): string {
  const key = deriveKey();
  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
