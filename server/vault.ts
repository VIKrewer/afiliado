import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export class Vault {
  fingerprint(value: string) {
    return createHmac("sha256", this.key)
      .update(value)
      .digest("hex")
      .slice(0, 24);
  }
  private key: Buffer;
  constructor() {
    let hex = process.env.SETTINGS_ENCRYPTION_KEY;
    if (!hex) {
      if (process.env.NODE_ENV === "production")
        throw new Error("Defina SETTINGS_ENCRYPTION_KEY (64 caracteres hex).");
      mkdirSync(".data", { recursive: true });
      const path = resolve(".data/vault.key");
      if (!existsSync(path))
        writeFileSync(path, randomBytes(32).toString("hex"), {
          mode: 0o600,
          flag: "wx",
        });
      hex = readFileSync(path, "utf8").trim();
    }
    if (!/^[a-f\d]{64}$/i.test(hex))
      throw new Error("SETTINGS_ENCRYPTION_KEY inválida.");
    this.key = Buffer.from(hex, "hex");
  }
  encrypt(value: Record<string, string>) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  }
  decrypt(value?: string): Record<string, string> {
    if (!value) return {};
    const b = Buffer.from(value, "base64");
    const cipher = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
    cipher.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString(),
    );
  }
}
