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
