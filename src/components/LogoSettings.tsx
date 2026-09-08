import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { SettingsConfig } from "../types";
import { logoWidthMm, prepareLogo, safeLogoDataUrl } from "../logo";
import { buildSaleDocument } from "../documents";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { printDocument } from "../../app/printing";
import { Icon } from "./WorkshopIcon";
import "./logo-settings.css";

type LogoOptions = Required<Pick<SettingsConfig, "logoDataUrl" | "logoFileName" | "logoWidthMm" | "logoOnThermal" | "logoOnA4">>;
type Props = { settings: Partial<SettingsConfig>; canManage: boolean; ready: boolean; notify: (message: string) => void; onSaved: (logo: LogoOptions) => void };
const optionsOf = (settings: Partial<SettingsConfig>): LogoOptions => ({
  logoDataUrl: safeLogoDataUrl(settings.logoDataUrl), logoFileName: settings.logoFileName ?? "",
  logoWidthMm: logoWidthMm(settings.logoWidthMm), logoOnThermal: settings.logoOnThermal !== false, logoOnA4: settings.logoOnA4 !== false,
});

export function LogoSettings({ settings, canManage, ready, notify, onSaved }: Props) {
  const [logo, setLogo] = useState(() => optionsOf(settings));
  const [format, setFormat] = useState("Cupom 80mm");
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const dirtyRef = useRef(false);
  const mounted = useRef(true);
  const uploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!dirtyRef.current) setLogo(optionsOf(settings));
  }, [settings.logoDataUrl, settings.logoFileName, settings.logoWidthMm, settings.logoOnThermal, settings.logoOnA4]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(changes: Partial<LogoOptions>) {
    if (!canManage || !ready || processing || saving) return;
    dirtyRef.current = true; setDirty(true); setError("");
    setLogo(previous => ({ ...previous, ...changes }));
  }
  async function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !canManage || !ready || processing || saving) return;
    setProcessing(true); setError("");
    try {
      const dataUrl = await prepareLogo(file);
      if (!mounted.current) return;
      setLogo(previous => ({ ...previous, logoDataUrl: dataUrl, logoFileName: file.name }));
      dirtyRef.current = true; setDirty(true);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "Não foi possível preparar a imagem.");
    } finally { if (mounted.current) setProcessing(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canManage || !ready || saving || processing || !dirty) return;
    setSaving(true); setError("");
    try {
      // Merge only these five fields; other settings and the OS counter stay current.
      await saveFirestoreDoc("settings", "global", logo);
      dirtyRef.current = false;
      onSaved(logo);
      if (mounted.current) setDirty(false);
      notify(logo.logoDataUrl ? "Logomarca salva. As próximas impressões usarão esta configuração." : "Logomarca removida dos documentos.");
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente.");
    } finally { if (mounted.current) setSaving(false); }
  }
  const preview = useMemo(() => buildSaleDocument({
    id: "TESTE DE IMPRESSÃO", origin: "PDV", date: "Exemplo", soldAt: "", total: 0,
    paymentMethod: "Exemplo", items: [{ id: "preview", type: "Mão de obra", name: "Produto ou serviço de exemplo", quantity: 1, price: 0 }],
  }, { ...settings, ...logo, printFormat: format }), [settings, logo, format]);
  const visibleHere = format === "A4" ? logo.logoOnA4 : logo.logoOnThermal;

  return <form className="settings-card logo-settings" onSubmit={save} noValidate>
    <div className="settings-card-header"><div><h2>Logomarca da oficina</h2><p>Sua marca no cabeçalho dos documentos impressos.</p></div><button className="primary-button" type="submit" disabled={!canManage || !ready || !dirty || saving || processing}>{saving ? "Salvando…" : "Salvar logomarca"}</button></div>
    <div className="settings-card-body">
      {!ready && <p role="status">Carregando a configuração da oficina…</p>}
      {error && <div className="settings-modal-error" role="alert"><span>{error}</span></div>}
      <div className="logo-settings-grid">
        <fieldset className="logo-controls" disabled={!canManage || !ready || saving || processing}>
          <legend className="logo-section-label">Imagem da logomarca</legend>
          <div className={`logo-upload-surface ${logo.logoDataUrl ? "has-image" : ""}`}>
            {logo.logoDataUrl ? <img src={logo.logoDataUrl} alt="Logomarca escolhida para a oficina"/> : <><span className="logo-empty-icon"><Icon name="file" size={30}/></span><strong>Envie a logomarca da oficina</strong><span>PNG, JPG ou WebP, até 5 MB.</span></>}
          </div>
          {logo.logoDataUrl && <p className="logo-file-name">{logo.logoFileName || "Logomarca da oficina"}</p>}
          <input ref={uploadRef} className="logo-file-input" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Enviar imagem da logomarca" onChange={chooseImage}/>
          <div className="logo-upload-actions"><button type="button" className="outline-button" onClick={() => uploadRef.current?.click()}><Icon name="plus" size={16}/>{processing ? "Preparando…" : logo.logoDataUrl ? "Trocar imagem" : "Escolher imagem"}</button>{logo.logoDataUrl && <button type="button" className="text-button" onClick={() => update({ logoDataUrl: "", logoFileName: "" })}>Remover</button>}</div>
          <p className="logo-help">Prefira uma imagem nítida, com fundo branco ou transparente. A impressora térmica imprime em preto e branco.</p>
          <div className="logo-options">
            <label className="settings-field"><span className="settings-field-label">Tamanho da logomarca</span><select className="settings-select" value={logo.logoWidthMm} onChange={event => update({ logoWidthMm: Number(event.target.value) })}><option value={32}>Pequena · 32 mm</option><option value={44}>Média · 44 mm</option><option value={56}>Grande · 56 mm</option>{![32,44,56].includes(logo.logoWidthMm) && <option value={logo.logoWidthMm}>Personalizada · {logo.logoWidthMm} mm</option>}</select></label>
            <label className="logo-check"><input type="checkbox" checked={logo.logoOnThermal} onChange={event => update({ logoOnThermal: event.target.checked })}/><span><strong>Mostrar nos cupons térmicos</strong><small>Comprovantes e OS em papel de 58 ou 80 mm.</small></span></label>
            <label className="logo-check"><input type="checkbox" checked={logo.logoOnA4} onChange={event => update({ logoOnA4: event.target.checked })}/><span><strong>Mostrar nos documentos A4</strong><small>Ordens de serviço, orçamentos e comprovantes.</small></span></label>
          </div>
        </fieldset>
        <section className="logo-preview-panel" aria-label="Prévia da impressão">
          <header><h3>Como vai ficar</h3><label><span className="logo-section-label">Formato da prévia</span><select value={format} onChange={event => setFormat(event.target.value)} aria-label="Formato da prévia"><option value="Cupom 80mm">Cupom 80 mm</option><option value="Cupom 58mm">Cupom 58 mm</option><option value="A4">Comprovante A4</option></select></label></header>
          <div className={`logo-paper-preview ${format === "A4" ? "is-a4" : "is-thermal"}`}><iframe title={`Prévia de impressão — ${format}`} srcDoc={preview} sandbox=""/></div>
          {logo.logoDataUrl && !visibleHere && <p className="logo-help">A logomarca está desativada para este formato.</p>}
          <button type="button" className="outline-button" onClick={() => printDocument(preview)} disabled={processing || !ready}><Icon name="printer" size={16}/>Imprimir teste</button>
          <p className="logo-help">Este teste não registra venda. Os documentos atuais são não fiscais.</p>
        </section>
      </div>
      <p className={`logo-save-status ${dirty ? "has-changes" : ""}`} role="status">{processing ? "Preparando a imagem…" : dirty ? "Alterações pendentes. Clique em Salvar logomarca para aplicar." : logo.logoDataUrl ? "Logomarca configurada. Você pode conferir o resultado na impressão de teste." : "Sem logomarca. Os documentos continuam exibindo os dados da oficina."}</p>
    </div>
  </form>;
}
