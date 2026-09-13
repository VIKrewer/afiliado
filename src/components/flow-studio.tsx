"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyEdgeChanges,
  type NodeProps,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Play,
  Plus,
  Save,
  Workflow as WorkflowIcon,
  Filter,
  Sparkles,
  Search,
  Send,
  ImagePlus,
  Trash2,
  Download,
  Upload,
  Settings2,
  Check,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import type { Doc } from "@/lib/types";
import {
  newWorkflow,
  stageLabels,
  type FlowNode,
  type Workflow,
  type FlowProps,
  type AutomationData,
} from "@/lib/flow-types";

const icons = {
  source: Search,
  filter: Filter,
  enrich: ImagePlus,
  copy: Sparkles,
  publish: Send,
};
type CanvasNode = Node<FlowNode & Record<string, unknown>>;
function Stage({ data, selected }: NodeProps<CanvasNode>) {
  const Icon = icons[data.kind];
  return (
    <div
      className={`flow-stage stage-${data.kind} ${selected ? "selected" : ""}`}
    >
      {data.kind !== "source" && (
        <Handle type="target" position={Position.Left} />
      )}
      <div className="stage-icon">
        <Icon size={20} />
      </div>
      <div>
        <strong>{stageLabels[data.kind]}</strong>
        <small>
          {data.kind === "source"
            ? `${data.config.provider === "feed" ? "Feed JSON" : "Shopee"} · ${data.config.keyword || "todas"}`
            : data.kind === "filter"
              ? `${data.config.minDiscount || 0}% de desconto mínimo`
              : data.kind === "copy"
                ? data.config.style || "resenha"
                : data.kind === "enrich"
                  ? "Dados da página e imagem"
                  : "Destinos configurados"}
        </small>
      </div>
      {data.kind !== "publish" && (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
const nodeTypes = { stage: Stage };
export function FlowStudio({ api, channels }: FlowProps) {
  const [data, setData] = useState<AutomationData>({
    workflows: [],
    runs: [],
    candidates: [],
  });
  const [flow, setFlow] = useState<Workflow>(newWorkflow);
  const [id, setId] = useState("");
  const [stageId, setStageId] = useState("step-0");
  const [view, setView] = useState<"builder" | "runs" | "inbox">("builder");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<{
    id: string;
    headline: string;
    copy: string;
  } | null>(null);
  const reload = () => api<AutomationData>("automations").then(setData);
  useEffect(() => {
    let live = true;
    void api<AutomationData>("automations")
      .then((r) => {
        if (live) {
          setData(r);
          if (r.workflows[0]) {
            setId(r.workflows[0].id);
            setFlow(r.workflows[0].data);
            setStageId(r.workflows[0].data.nodes[0].id);
          }
        }
      })
      .catch((e) => setError(e.message));
    const t = setInterval(
      () =>
        void api<AutomationData>("automations")
          .then((r) => {
            if (live) setData(r);
          })
          .catch(() => {}),
      5000,
    );
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [api]);
  async function action(fn: () => Promise<unknown>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(false);
    }
  }
  function change(p: Partial<Workflow>) {
    setFlow((f) => ({ ...f, ...p }));
    setDirty(true);
  }
  async function save(next = flow) {
    const r = await api<Doc<Workflow>>(
      id ? `automations/${id}` : "automations",
      id ? "PUT" : "POST",
      next,
    );
    setId(r.id);
    setFlow(r.data);
    setDirty(false);
    await reload();
    return r.id;
  }
  function choose(doc: Doc<Workflow>) {
    setId(doc.id);
    setFlow(doc.data);
    setStageId(doc.data.nodes[0]?.id || "");
    setDirty(false);
  }
  const node = flow.nodes.find((n) => n.id === stageId);
  function config(p: Partial<FlowNode["config"]>) {
    change({
      nodes: flow.nodes.map((n) =>
        n.id === stageId ? { ...n, config: { ...n.config, ...p } } : n,
      ),
    });
  }
  function add(kind: FlowNode["kind"]) {
    const key = crypto.randomUUID();
    change({
      nodes: [
        ...flow.nodes,
        {
          id: key,
          kind,
          position: { x: 200, y: 280 },
          config:
            kind === "filter"
              ? { minDiscount: 10 }
              : kind === "copy"
                ? { style: "resenha" }
                : {},
        },
      ],
    });
    setStageId(key);
  }
  function exportFlow() {
    const { nextRun: _n, lastRun: _l, running: _r, ...portable } = flow;
    void _n;
    void _l;
    void _r;
    const blob = new Blob(
      [
        JSON.stringify(
          { ...portable, enabled: false, channelIds: [] },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fluxo-afiliado.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="automation-studio">
      <div className="studio-tabs">
        <button
          className={view === "builder" ? "selected" : ""}
          onClick={() => setView("builder")}
        >
          <WorkflowIcon size={17} />
          Editor de fluxos
        </button>
        <button
          className={view === "inbox" ? "selected" : ""}
          onClick={() => setView("inbox")}
        >
          <ImagePlus size={17} />
          Descobertas{" "}
          <span>
            {data.candidates.filter((c) => c.data.status === "review").length}
          </span>
        </button>
        <button
          className={view === "runs" ? "selected" : ""}
          onClick={() => setView("runs")}
        >
          <Play size={17} />
          Execuções
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {message && (
        <div className="alert success" role="status">
          <Check size={18} />
          {message}
        </div>
      )}
      {view === "builder" && (
        <>
          <div className="flow-topbar">
            <select
              aria-label="Selecionar fluxo"
              value={id}
              onChange={(e) => {
                const doc = data.workflows.find((f) => f.id === e.target.value);
                if (doc) choose(doc);
              }}
            >
              <option value="">Novo fluxo</option>
              {data.workflows.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.data.enabled ? "● " : ""}
                  {f.data.name}
                </option>
              ))}
            </select>
            <button
              className="button"
              onClick={() => {
                setId("");
                setFlow(newWorkflow());
                setStageId("step-0");
                setDirty(false);
              }}
            >
              <Plus size={16} />
              Novo
            </button>
            <div className="flow-topbar-spacer" />
            <span className="muted">
              {dirty
                ? "Alterações não salvas"
                : id
                  ? "Salvo no Supabase"
                  : "Modelo pronto para configurar"}
            </span>
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const key = await save();
                  await api(`automations/${key}/test`, "POST");
                  setView("runs");
                }, "Teste iniciado: busca real, sem publicar mensagens.")
              }
            >
              <Play size={16} />
              Testar sem enviar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action(() => save(), "Fluxo salvo.")}
            >
              <Save size={16} />
              Salvar fluxo
            </button>
          </div>
          <div className="flow-workbench">
            <div className="flow-palette">
              <strong>Etapas</strong>
              {(["filter", "enrich", "copy"] as const).map((kind) => {
                const Icon = icons[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => add(kind)}
                    title={`Adicionar ${stageLabels[kind]}`}
                  >
                    <Icon size={19} />
                    <span>{stageLabels[kind]}</span>
                    <Plus size={13} />
                  </button>
                );
              })}
              <hr />
              <button onClick={exportFlow}>
                <Download size={18} />
                <span>Exportar JSON</span>
              </button>
              <button onClick={() => importRef.current?.click()}>
                <Upload size={18} />
                <span>Importar JSON</span>
              </button>
              <input
                ref={importRef}
                hidden
                type="file"
                accept="application/json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file)
                    void action(async () => {
                      if (file.size > 50000)
                        throw new Error("Arquivo muito grande.");
                      const parsed = JSON.parse(await file.text());
                      const result = await api<Doc<Workflow>>(
                        "automations",
                        "POST",
                        { ...parsed, enabled: false, channelIds: [] },
                      );
                      choose(result);
                      await reload();
                    }, "Fluxo importado desativado e sem destinos.");
                  e.target.value = "";
                }}
              />
              <p>
                Arraste as etapas. Ligue os pontos para alterar a ordem.
                Selecione uma etapa para configurar.
              </p>
            </div>
            <div className="flow-canvas">
              <ReactFlow<CanvasNode>
                nodes={flow.nodes.map((n) => ({
                  id: n.id,
                  type: "stage",
                  position: n.position,
                  data: { ...n },
                  selected: n.id === stageId,
                }))}
                edges={flow.edges.map((e) => ({
                  ...e,
                  type: "smoothstep",
                  animated: !!data.workflows.find((f) => f.id === id)?.data
                    .running,
                }))}
                nodeTypes={nodeTypes}
                onNodeClick={(_e, n) => setStageId(n.id)}
                onNodesChange={(changes) => {
                  const positions = changes.filter(
                    (c) => c.type === "position" && c.position,
                  );
                  if (positions.length)
                    change({
                      nodes: flow.nodes.map((n) => {
                        const c = positions.find(
                          (c) => c.type === "position" && c.id === n.id,
                        );
                        return c && c.type === "position" && c.position
                          ? { ...n, position: c.position }
                          : n;
                      }),
                    });
                }}
                onEdgesChange={(changes) =>
                  change({ edges: applyEdgeChanges(changes, flow.edges) })
                }
                onConnect={(connection) =>
                  change({ edges: addEdge(connection, flow.edges) })
                }
                fitView
                minZoom={0.2}
                maxZoom={1.5}
                deleteKeyCode={["Backspace", "Delete"]}
              >
                <Background gap={22} color="#d4d9cf" />
                <Controls />
                <MiniMap nodeColor="#637f69" pannable zoomable />
              </ReactFlow>
              <div className="canvas-caption">
                Fonte → regras → conteúdo → destinos · conexões definem a ordem
                real de execução
              </div>
            </div>
            <aside className="flow-inspector">
              {node && (
                <>
                  <div className="section-heading">
                    <h3>{stageLabels[node.kind]}</h3>
                    {!["source", "publish"].includes(node.kind) && (
                      <button
                        aria-label="Remover etapa"
                        onClick={() => {
                          change({
                            nodes: flow.nodes.filter((n) => n.id !== stageId),
                            edges: flow.edges.filter(
                              (e) =>
                                e.source !== stageId && e.target !== stageId,
                            ),
                          });
                          setStageId(flow.nodes[0].id);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {node.kind === "source" && (
                    <>
                      <label>
                        Fonte
                        <select
                          value={node.config.provider || "shopee"}
                          onChange={(e) =>
                            config({
                              provider: e.target.value as "shopee" | "feed",
                            })
                          }
                        >
                          <option value="shopee">Shopee Affiliate API</option>
                          <option value="feed">Feed JSON autorizado</option>
                        </select>
                      </label>
                      <label>
                        Buscar produtos
                        <input
                          value={node.config.keyword || ""}
                          onChange={(e) => config({ keyword: e.target.value })}
                          placeholder="teclado mecânico, casa…"
                        />
                      </label>
                      {node.config.provider === "feed" && (
                        <label>
                          URL do feed
                          <input
                            type="url"
                            value={node.config.feedUrl || ""}
                            onChange={(e) =>
                              config({ feedUrl: e.target.value })
                            }
                            placeholder="https://provedor.com/ofertas.json"
                          />
                        </label>
                      )}
                      <p className="footnote">
                        Credenciais são configuradas em Fontes, não ficam dentro
                        do fluxo. Um feed deve fornecer título, preço, imagem e
                        link comissionado.
                      </p>
                    </>
                  )}
                  {node.kind === "filter" && (
                    <>
                      <label>
                        Desconto mínimo (%)
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={node.config.minDiscount || 0}
                          onChange={(e) =>
                            config({ minDiscount: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Preço máximo (R$)
                        <input
                          type="number"
                          min="0"
                          value={node.config.maxPrice || 0}
                          onChange={(e) =>
                            config({ maxPrice: Number(e.target.value) })
                          }
                        />
                        <small>0 = sem limite</small>
                      </label>
                      <label>
                        Palavras desejadas
                        <input
                          value={node.config.include || ""}
                          onChange={(e) => config({ include: e.target.value })}
                          placeholder="teclado, mouse"
                        />
                      </label>
                      <label>
                        Excluir palavras
                        <input
                          value={node.config.exclude || ""}
                          onChange={(e) => config({ exclude: e.target.value })}
                          placeholder="usado, recondicionado"
                        />
                      </label>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={node.config.requireImage || false}
                          onChange={(e) =>
                            config({ requireImage: e.target.checked })
                          }
                        />
                        Exigir foto
                      </label>
                    </>
                  )}
                  {node.kind === "enrich" && (
                    <>
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={node.config.fetchPage !== false}
                          onChange={(e) =>
                            config({ fetchPage: e.target.checked })
                          }
                        />
                        Consultar página pública do produto
                      </label>
                      <p>
                        Obtém descrição estruturada e foto sem alterar o preço
                        vindo da fonte. Se a loja bloquear acesso, mantém os
                        dados recebidos da API.
                      </p>
                    </>
                  )}
                  {node.kind === "copy" && (
                    <>
                      <label>
                        Voz do canal
                        <select
                          value={node.config.style || "resenha"}
                          onChange={(e) =>
                            config({ style: e.target.value as "resenha" })
                          }
                        >
                          <option value="resenha">Resenha entre amigos</option>
                          <option value="gamer">Gamer / setup</option>
                          <option value="direto">Direto ao ponto</option>
                          <option value="premium">Elegante</option>
                        </select>
                      </label>
                      <label>
                        Instruções desta etapa
                        <textarea
                          rows={7}
                          value={node.config.instructions || ""}
                          onChange={(e) =>
                            config({ instructions: e.target.value })
                          }
                          placeholder="Ex.: chamada curta em caixa alta; fale com tu; explique os switches quando informados."
                        />
                      </label>
                      <p>
                        O estilo global, público e exemplos ficam em
                        Personalizar. Aqui você pode ajustar a voz deste fluxo.
                      </p>
                    </>
                  )}
                  {node.kind === "publish" && (
                    <>
                      <label>
                        Modo
                        <select
                          value={flow.autoPublish ? "auto" : "review"}
                          onChange={(e) =>
                            change({ autoPublish: e.target.value === "auto" })
                          }
                        >
                          <option value="review">Enviar para revisão</option>
                          <option value="auto">Publicar automaticamente</option>
                        </select>
                      </label>
                      {channels.map((c) => (
                        <label className="check-row" key={c.id}>
                          <input
                            type="checkbox"
                            checked={flow.channelIds.includes(c.id)}
                            onChange={(e) =>
                              change({
                                channelIds: e.target.checked
                                  ? [...flow.channelIds, c.id]
                                  : flow.channelIds.filter((v) => v !== c.id),
                              })
                            }
                          />
                          {c.data.name}
                        </label>
                      ))}
                      {!channels.length && (
                        <p>Cadastre destinos na navegação principal.</p>
                      )}
                      <label className="check-row">
                        <input
                          type="checkbox"
                          checked={flow.tracking}
                          onChange={(e) =>
                            change({ tracking: e.target.checked })
                          }
                        />
                        Rastrear cliques
                      </label>
                      <p className="footnote">
                        Tracking exige domínio HTTPS público. Sem ele, o envio
                        usa o link direto comissionado.
                      </p>
                    </>
                  )}
                </>
              )}
            </aside>
          </div>
          <section className="panel flow-schedule">
            <div className="integration-title">
              <Settings2 size={20} />
              <h2>Ritmo da automação</h2>
              <label className="check-row flow-enabled">
                <input
                  type="checkbox"
                  checked={flow.enabled}
                  onChange={(e) => change({ enabled: e.target.checked })}
                />
                Ativar fluxo ao salvar
              </label>
            </div>
            <div className="schedule-grid">
              <label>
                Nome
                <input
                  value={flow.name}
                  onChange={(e) => change({ name: e.target.value })}
                />
              </label>
              <label>
                Buscar a cada (min)
                <input
                  type="number"
                  min="15"
                  max="10080"
                  value={flow.intervalMinutes}
                  onChange={(e) =>
                    change({ intervalMinutes: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Ofertas por execução
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={flow.maxPerRun}
                  onChange={(e) =>
                    change({ maxPerRun: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Limite diário
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={flow.dailyLimit}
                  onChange={(e) =>
                    change({ dailyLimit: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Não repetir por (horas)
                <input
                  type="number"
                  min="1"
                  value={flow.cooldownHours}
                  onChange={(e) =>
                    change({ cooldownHours: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Das
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={flow.startHour}
                  onChange={(e) =>
                    change({ startHour: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Até
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={flow.endHour}
                  onChange={(e) => change({ endHour: Number(e.target.value) })}
                />
              </label>
              <label>
                Fuso
                <select
                  value={flow.timezone}
                  onChange={(e) => change({ timezone: e.target.value })}
                >
                  <option>America/Sao_Paulo</option>
                  <option>America/Manaus</option>
                  <option>America/Rio_Branco</option>
                  <option>UTC</option>
                </select>
              </label>
            </div>
            <p className="footnote">
              Salvar com o fluxo ativo autoriza execuções nos horários
              definidos. O modo automático autoriza publicar nos destinos
              selecionados. O servidor precisa permanecer ligado.
            </p>
          </section>
        </>
      )}
      {view === "runs" && (
        <div className="run-list">
          {!data.runs.length && (
            <div className="empty">
              <Play />
              <h2>Veja cada decisão do seu fluxo</h2>
              <p>
                Use Testar sem enviar para buscar ofertas reais e acompanhar as
                etapas antes de ativar.
              </p>
            </div>
          )}
          {data.runs.map((run) => (
            <details
              className="panel run-row"
              key={run.id}
              open={run.data.state === "running"}
            >
              <summary>
                <div>
                  <strong>{run.data.workflowName}</strong>
                  <small>
                    {new Date(run.data.started).toLocaleString("pt-BR")} ·{" "}
                    {run.data.preview ? "teste sem envio" : "automação"}
                  </small>
                </div>
                <span
                  className={`badge ${run.data.state === "failed" ? "failed" : run.data.state === "running" ? "queued" : "sent"}`}
                >
                  {{
                    running: "Executando",
                    success: "Concluída",
                    partial: "Com avisos",
                    failed: "Falhou",
                    interrupted: "Interrompida",
                  }[run.data.state] || run.data.state}
                </span>
                <span>
                  {run.data.found} encontradas · {run.data.queued} envios
                </span>
                <ChevronRight size={18} />
              </summary>
              {run.data.error && <p className="job-error">{run.data.error}</p>}
              <div className="run-events">
                {run.data.logs.map((log, i) => (
                  <div key={i}>
                    <code>{log.step}</code>
                    <span>{log.message}</span>
                    <time>{new Date(log.at).toLocaleTimeString("pt-BR")}</time>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
      {view === "inbox" && (
        <>
          {!data.candidates.length ? (
            <div className="empty">
              <Search />
              <h2>Sua caixa de descobertas</h2>
              <p>
                As ofertas encontradas pelo fluxo aparecem aqui com o conteúdo
                já preparado.
              </p>
            </div>
          ) : (
            <div className="product-grid">
              {data.candidates.map((c) => (
                <article className="product-card" key={c.id}>
                  {c.data.offer.imageUrl && (
                    <img
                      className="discovery-image"
                      src={c.data.offer.imageUrl}
                      alt={c.data.offer.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  )}
                  <div className="product-body">
                    <span className="badge">
                      {c.data.offer.store} ·{" "}
                      {c.data.status === "queued"
                        ? "Enfileirado"
                        : "Para revisar"}
                    </span>
                    <h3>{c.data.offer.headline || c.data.offer.title}</h3>
                    <p>{c.data.offer.title}</p>
                    <p className="discovery-copy">{c.data.offer.copy}</p>
                    {editing?.id === c.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(async () => {
                            await api(`candidates/${c.id}`, "PUT", {
                              headline: editing.headline,
                              copy: editing.copy,
                            });
                            setEditing(null);
                            await reload();
                          }, "Texto da descoberta atualizado.");
                        }}
                      >
                        <label>
                          Chamada
                          <input
                            maxLength={65}
                            value={editing.headline}
                            onChange={(e) =>
                              setEditing({
                                ...editing,
                                headline: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Descrição
                          <textarea
                            rows={5}
                            maxLength={500}
                            value={editing.copy}
                            onChange={(e) =>
                              setEditing({ ...editing, copy: e.target.value })
                            }
                          />
                        </label>
                        <div className="form-actions">
                          <button className="button" disabled={busy}>
                            Salvar texto
                          </button>
                          <button
                            type="button"
                            className="text-button"
                            onClick={() => setEditing(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      c.data.status === "review" && (
                        <button
                          className="text-button"
                          onClick={() =>
                            setEditing({
                              id: c.id,
                              headline: c.data.offer.headline || "",
                              copy: c.data.offer.copy,
                            })
                          }
                        >
                          Editar texto antes de enviar
                        </button>
                      )
                    )}
                    <div className="price-line">
                      <strong>
                        {c.data.offer.price.toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </strong>
                      <span>{c.data.offer.discountPercent}% na fonte</span>
                    </div>
                    <a
                      href={c.data.offer.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Conferir produto
                    </a>
                    <div className="card-bottom">
                      <small>
                        {new Date(c.data.created).toLocaleString("pt-BR")}
                      </small>
                      <button
                        disabled={busy || c.data.status === "queued"}
                        className="button primary"
                        onClick={() =>
                          void action(async () => {
                            await api(`candidates/${c.id}/publish`, "POST");
                            await reload();
                          }, "Oferta enfileirada nos destinos do fluxo.")
                        }
                      >
                        <Send size={15} />
                        Aprovar envio
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
