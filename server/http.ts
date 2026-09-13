import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { publicUrl } from "./domain";

export function isPublicAddress(value: string) {
  try {
    return ipaddr.process(value).range() === "unicast";
  } catch {
    return false;
  }
}
/** Pins the connection to a validated IP; every redirect is validated again. */
export async function safeDownload(
  value: string,
  maxBytes = 2_000_000,
  headers: Record<string, string> = {},
  redirects = 0,
): Promise<{ bytes: Buffer; type: string; url: string }> {
  const url = new URL(publicUrl(value));
  if (url.port && url.port !== "443")
    throw new Error("Somente HTTPS na porta 443 é permitido.");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Endereço de rede privado ou reservado bloqueado.");
  const address = addresses[0];
  const result = await new Promise<{
    status: number;
    bytes: Buffer;
    type: string;
    location?: string;
  }>((resolve, reject) => {
    const req = request(
      {
        hostname: address.address,
        family: address.family,
        servername: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          Host: url.host,
          "User-Agent": "Afiliado/1.0 (+product-research)",
          Accept: "application/json,text/html,image/*",
          ...headers,
        },
        timeout: 15000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            res.destroy();
            reject(new Error("Resposta excede o limite permitido."));
          } else chunks.push(chunk);
        });
        res.on("error", () => reject(new Error("Falha ao ler a fonte.")));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 500,
            bytes: Buffer.concat(chunks),
            type: String(res.headers["content-type"] || ""),
            location: res.headers.location,
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(new Error("Tempo de resposta excedido.")),
    );
    req.on("error", () =>
      reject(new Error("Não foi possível acessar a fonte HTTPS.")),
    );
    req.end();
  });
  if (result.status >= 300 && result.status < 400 && result.location) {
    if (redirects >= 3 || Object.keys(headers).length)
      throw new Error("Redirecionamento não permitido para esta fonte.");
    return safeDownload(
      new URL(result.location, url).href,
      maxBytes,
      {},
      redirects + 1,
    );
  }
  if (result.status < 200 || result.status >= 300)
    throw new Error(
      `Fonte respondeu HTTP ${result.status}. Confira URL e permissão de acesso.`,
    );
  return { ...result, url: url.href };
}
