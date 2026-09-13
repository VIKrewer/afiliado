import "reflect-metadata";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Module,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseFilters,
  Catch,
  ArgumentsHost,
  ExceptionFilter,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { randomBytes, randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { Service } from "./service";
import { Automation } from "./automation";
import { Sources } from "./sources";

type Authed = Request & { owner: string };
const localToken = randomBytes(32).toString("hex");
const limits = new Map<string, { count: number; reset: number }>();
function rate(key: string, max: number) {
  const now = Date.now();
  if (limits.size > 10000)
    for (const [key, value] of limits)
      if (value.reset < now) limits.delete(key);
  const current = limits.get(key);
  if (!current || current.reset < now) {
    limits.set(key, { count: 1, reset: now + 60000 });
    return true;
  }
  return ++current.count <= max;
}
@Catch()
class Errors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ZodError)
      return res.status(400).json({
        message: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join(" "),
      });
    if (error instanceof HttpException)
      return res.status(error.getStatus()).json({ message: error.message });
    return res.status(500).json({
      message:
        "Não foi possível concluir. Confira a configuração dos serviços e tente novamente.",
    });
  }
}
@Controller()
@UseFilters(Errors)
class Api {
  constructor(
    private readonly service: Service,
    private readonly automation: Automation,
    private readonly sources: Sources,
  ) {}
  @Get("api/preferences") preferences(@Req() r: Authed) {
    return this.service.preferences(r.owner);
  }
  @Put("api/preferences") savePreferences(
    @Req() r: Authed,
    @Body() body: unknown,
  ) {
    return this.service.savePreferences(r.owner, body);
  }
  @Get("api/sources") sourceStatus(@Req() r: Authed) {
    return this.service.sourceStatus(r.owner);
  }
  @Put("api/sources") sourcesSave(@Req() r: Authed, @Body() body: unknown) {
    return this.service.saveSourceCredentials(r.owner, body);
  }
  @Post("api/sources/shopee/check") sourceCheck(@Req() r: Authed) {
    return this.sources
      .discover(r.owner, {
        id: "test",
        kind: "source",
        position: { x: 0, y: 0 },
        config: { provider: "shopee" },
      })
      .then((offers) => ({ ok: true, count: offers.length }));
  }
  @Get("api/automations") flows(@Req() r: Authed) {
    return this.automation.list(r.owner);
  }
  @Post("api/automations") createFlow(@Req() r: Authed, @Body() body: unknown) {
    return this.automation.save(r.owner, body);
  }
  @Put("api/automations/:id") updateFlow(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.automation.save(r.owner, body, id);
  }
  @Delete("api/automations/:id") removeFlow(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.automation.remove(r.owner, id);
  }
  @Post("api/automations/:id/test") testFlow(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.automation.start(r.owner, id, true);
  }
  @Post("api/candidates/:id/publish") candidate(
    @Req() r: Authed,
    @Param("id") id: string,
  ) {
    return this.automation.publishCandidate(r.owner, id);
  }
  @Get("api/health") health() {
    return { ok: true };
  }
  @Put("api/candidates/:id") candidateEdit(
    @Req() r: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.automation.editCandidate(r.owner, id, body);
  }
  @Get("api/bootstrap") bootstrap() {
    return {
      mode: this.service.store.supabase ? "supabase" : "local",
      localToken: this.service.store.supabase ? undefined : localToken,
      supabaseUrl:
        process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      supabaseKey:
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
        "",
    };
  }
  @Get("api/dashboard") dashboard(@Req() req: Authed) {
    return this.service.dashboard(req.owner);
  }
  @Put("api/settings") settings(@Req() req: Authed, @Body() body: unknown) {
    return this.service.saveSettings(req.owner, body);
  }
  @Post("api/telegram/check") check(@Req() req: Authed) {
    return this.service.bot(req.owner);
  }
  @Post("api/telegram/discover") discover(@Req() req: Authed) {
    return this.service.discover(req.owner);
  }
  @Post("api/channels") channel(@Req() req: Authed, @Body() body: unknown) {
    return this.service.saveChannel(req.owner, body);
  }
  @Delete("api/channels/:id") async deleteChannel(
    @Req() req: Authed,
    @Param("id") id: string,
  ) {
    const d = await this.service.store.get(id, req.owner);
    if (d?.kind === "channel") await this.service.store.remove(id, req.owner);
    return { ok: true };
  }
  @Post("api/products") product(@Req() req: Authed, @Body() body: unknown) {
    return this.service.saveProduct(req.owner, body);
  }
  @Put("api/products/:id") update(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.saveProduct(req.owner, body, id);
  }
  @Delete("api/products/:id") async deleteProduct(
    @Req() req: Authed,
    @Param("id") id: string,
  ) {
    const d = await this.service.store.get(id, req.owner);
    if (d?.kind === "product") await this.service.store.remove(id, req.owner);
    return { ok: true };
  }
  @Post("api/generate") generate(@Req() req: Authed, @Body() body: unknown) {
    if (!rate(`ai:${req.owner}`, 10))
      throw new HttpException(
        "Aguarde um minuto antes de gerar mais textos.",
        429,
      );
    return this.service.generate(req.owner, body);
  }
  @Post("api/jobs") jobs(@Req() req: Authed, @Body() body: unknown) {
    return this.service.enqueue(req.owner, body);
  }
  @Post("api/jobs/:id/cancel") cancel(
    @Req() req: Authed,
    @Param("id") id: string,
  ) {
    return this.service.cancel(req.owner, id);
  }
  @Post("api/jobs/:id/retry") retry(
    @Req() req: Authed,
    @Param("id") id: string,
    @Body() body: { confirmed?: boolean },
  ) {
    return this.service.retry(req.owner, id, body.confirmed === true);
  }
  @Get("r/:id") async track(
    @Req() req: Request,
    @Res() res: Response,
    @Param("id") id: string,
  ) {
    if (!/^[a-f0-9]{32}$/.test(id))
      return res.status(404).send("Link não encontrado.");
    const cookie = req.headers.cookie?.match(
      /(?:^|; )af_visitor=([a-f0-9-]{36})(?:;|$)/,
    )?.[1];
    const visitor = cookie || randomUUID();
    const url = await this.service.track(
      id,
      visitor,
      req.headers["user-agent"] || "",
      req.headers.referer || "",
      req.method === "HEAD",
    );
    res.setHeader("Cache-Control", "no-store, private");
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!cookie && req.method !== "HEAD")
      res.cookie("af_visitor", visitor, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 86400000,
        path: "/r",
      });
    return res.redirect(302, url);
  }
}
@Module({ controllers: [Api], providers: [Service, Sources, Automation] })
class AppModule {}
async function main() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    logger: ["error", "warn", "log"],
  });
  app.enableShutdownHooks();
  app.use(helmet());
  app.use(json({ limit: "8mb" }));
  const service = app.get(Service);
  if (
    service.store.supabase &&
    !(
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    )
  )
    throw new Error("Configure SUPABASE_PUBLISHABLE_KEY.");
  app.use(async (req: Authed, res: Response, next: NextFunction) => {
    if (!req.path.startsWith("/api/")) return next();
    res.setHeader("Cache-Control", "no-store");
    if (req.path === "/api/health") return next();
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ message: "Origem não permitida." });
    if (!service.store.supabase) {
      const host = String(
        req.headers["x-forwarded-host"] || req.headers.host || "",
      ).split(":")[0];
      if (!["localhost", "127.0.0.1"].includes(host))
        return res
          .status(403)
          .json({ message: "Acesso remoto requer autenticação Supabase." });
      if (
        req.headers.origin &&
        !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin)
      )
        return res.status(403).json({ message: "Origem não permitida." });
    }
    if (req.path === "/api/bootstrap") return next();
    const token = req.headers.authorization?.replace(/^Bearer /, "");
    if (!token) return res.status(401).json({ message: "Entre na sua conta." });
    if (service.store.supabase) {
      try {
        const { data, error } =
          await service.store.supabase.auth.getUser(token);
        if (error || !data.user)
          return res
            .status(401)
            .json({ message: "Sessão expirada. Entre novamente." });
        req.owner = data.user.id;
        const host = String(
          req.headers["x-forwarded-host"] || req.headers.host || "",
        ).split(":")[0];
        if (["localhost", "127.0.0.1"].includes(host))
          await service.claimLocalOwner(req.owner);
      } catch {
        return res
          .status(503)
          .json({ message: "Autenticação indisponível. Tente novamente." });
      }
    } else {
      if (token !== localToken)
        return res
          .status(401)
          .json({ message: "Atualize a página para renovar o acesso local." });
      req.owner = "local";
    }
    if (!rate(req.owner, 180))
      return res
        .status(429)
        .json({ message: "Muitas solicitações. Aguarde um minuto." });
    next();
  });
  await app.listen(
    Number(process.env.API_PORT || 3001),
    process.env.API_HOST || "127.0.0.1",
  );
}
void main().catch(() => {
  console.error(
    "API não iniciou. Confira Supabase, chave de criptografia e disponibilidade da porta 3001.",
  );
  process.exit(1);
});
