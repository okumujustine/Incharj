import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { config, getFernetKeyBytes } from "../config";

const encoder = new TextEncoder();
const keyMaterial = getFernetKeyBytes();
const signingKey = keyMaterial.subarray(0, 16);
const encryptionKey = keyMaterial.subarray(16, 32);
const jwtKey = encoder.encode(config.appSecret);

function fernetTimestamp(date = new Date()): Buffer {
  const timestamp = Math.floor(date.getTime() / 1000);
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(timestamp));
  return bytes;
}

export function encryptCredentials(creds: Record<string, unknown>): string {
  const iv = randomBytes(16);
  const plaintext = Buffer.from(JSON.stringify(creds), "utf8");
  const cipher = createCipheriv("aes-128-cbc", encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const payload = Buffer.concat([
    Buffer.from([0x80]),
    fernetTimestamp(),
    iv,
    ciphertext
  ]);
  const signature = createHmac("sha256", signingKey).update(payload).digest();
  return Buffer.concat([payload, signature]).toString("base64url");
}

export function decryptCredentials(encrypted: string): Record<string, unknown> {
  const token = Buffer.from(encrypted, "base64url");
  const payload = token.subarray(0, token.length - 32);
  const signature = token.subarray(token.length - 32);
  const expected = createHmac("sha256", signingKey).update(payload).digest();
  if (!signature.equals(expected)) {
    throw new Error("Invalid credential signature");
  }

  const iv = payload.subarray(9, 25);
  const ciphertext = payload.subarray(25);
  const decipher = createDecipheriv("aes-128-cbc", encryptionKey, iv);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return JSON.parse(decrypted.toString("utf8")) as Record<
    string,
    unknown
  >;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function createAccessToken(data: Record<string, string>) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ ...data, type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + config.accessTokenExpireMinutes * 60)
    .sign(jwtKey);
}

export function createRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

export async function decodeAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, jwtKey, {
      algorithms: ["HS256"]
    });
    if (payload.type !== "access") {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
