import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Doc } from "./domain";

export class Store {
  close() {
    this.db?.close();
  }
  private db?: DatabaseSync;
  readonly supabase?: SupabaseClient;
  constructor() {
    const url =
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (url && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      this.supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    } else {
      if (process.env.NODE_ENV === "production")
        throw new Error("Configure Supabase antes de iniciar em produção.");
      mkdirSync(resolve(".data"), { recursive: true });
      this.db = new DatabaseSync(
        process.env.DATABASE_FILE || resolve(".data/afiliado.sqlite"),
      );
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, owner TEXT NOT NULL, kind TEXT NOT NULL, version INTEGER NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS records_owner_kind ON records(owner,kind);",
      );
    }
  }
  async list<T>(kind: string, owner?: string): Promise<Doc<T>[]> {
    if (this.supabase) {
      const all: Doc<T>[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = this.supabase
          .from("affiliate_records")
          .select("*")
          .eq("kind", kind)
          .order("id")
          .range(offset, offset + 499);
        if (owner) query = query.eq("owner", owner);
        const { data, error } = await query;
        if (error)
          throw new Error(
            "Falha no banco Supabase. Execute o SQL de instalação e confira as credenciais.",
          );
        all.push(...(data as Doc<T>[]));
        if (data.length < 500) return all;
      }
    }
    const rows = (owner
      ? this.db!.prepare("SELECT * FROM records WHERE kind=? AND owner=?").all(
          kind,
          owner,
        )
      : this.db!.prepare("SELECT * FROM records WHERE kind=?").all(
          kind,
        )) as unknown as (Omit<Doc<T>, "data"> & { data: string })[];
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  }
  async get<T>(id: string, owner?: string): Promise<Doc<T> | null> {
    if (this.supabase) {
      let q = this.supabase.from("affiliate_records").select("*").eq("id", id);
      if (owner) q = q.eq("owner", owner);
      const { data, error } = await q.maybeSingle();
      if (error) throw new Error("Falha ao consultar banco.");
      return data as Doc<T> | null;
    }
    const r = this.db!.prepare("SELECT * FROM records WHERE id=?").get(
      id,
    ) as unknown as (Omit<Doc<T>, "data"> & { data: string }) | undefined;
    return r && (!owner || r.owner === owner)
      ? { ...r, data: JSON.parse(r.data) }
      : null;
  }
  async insert<T>(doc: Doc<T>): Promise<boolean> {
    if (this.supabase) {
      const { error } = await this.supabase
        .from("affiliate_records")
        .insert(doc);
      if (error?.code === "23505") return false;
      if (error) throw new Error("Falha ao salvar no banco.");
      return true;
    }
    return (
      this.db!.prepare("INSERT OR IGNORE INTO records VALUES (?,?,?,?,?)").run(
        doc.id,
        doc.owner,
        doc.kind,
        doc.version,
        JSON.stringify(doc.data),
      ).changes !== 0
    );
  }
  async update<T>(doc: Doc<T>): Promise<boolean> {
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from("affiliate_records")
        .update({ data: doc.data, version: doc.version + 1 })
        .eq("id", doc.id)
        .eq("owner", doc.owner)
        .eq("version", doc.version)
        .select("id");
      if (error) throw new Error("Falha ao atualizar banco.");
      return !!data?.length;
    }
    return (
      this.db!.prepare(
        "UPDATE records SET data=?,version=version+1 WHERE id=? AND owner=? AND version=?",
      ).run(JSON.stringify(doc.data), doc.id, doc.owner, doc.version)
        .changes !== 0
    );
  }
  async remove(id: string, owner: string) {
    if (this.supabase) {
      const { error } = await this.supabase
        .from("affiliate_records")
        .delete()
        .eq("id", id)
        .eq("owner", owner);
      if (error) throw new Error("Falha ao excluir.");
    } else
      this.db!.prepare("DELETE FROM records WHERE id=? AND owner=?").run(
        id,
        owner,
      );
  }
}
