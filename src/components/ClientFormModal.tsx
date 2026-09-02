import React, { useState, useEffect } from "react";
import type { ClientRecord, MotorcycleRecord } from "../types";
import { defaultSystemLists } from "../types";
import { fullModelName, modelsOf, versionsOf } from "../motorcycle-catalog";
import { formatPlate, isValidPlate, motorcycleIdFor, platePattern, samePlate } from "../plate";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { NumberField } from "./NumberField";
import { nextSequentialId } from "../firestore-data";

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (client: ClientRecord) => void;
  editingClient?: ClientRecord | null;
  notify: (msg: string) => void;
  allClients: ClientRecord[];
  /** Motos já cadastradas, para saber se este cliente já tem alguma. */
  allMotorcycles?: MotorcycleRecord[];
  /** Marcas configuradas em Configurações → Listas do sistema. */
  brands?: string[];
  /**
   * Dados da moto já digitados na tela que abriu este cadastro.
   *
   * Chamado de dentro da OS, a placa já foi informada lá: repetir a digitação
   * aqui é trabalho dobrado e é onde nasce a divergência entre as duas telas.
   */
  defaultMotorcycle?: { plate?: string; brand?: string; model?: string; version?: string; year?: string; color?: string };
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingClient,
  notify,
  allClients,
  allMotorcycles = [],
  brands = [],
  defaultMotorcycle,
}) => {
  const [activeTab, setActiveTab] = useState<"ident" | "contact" | "address" | "financial" | "notes">("ident");
  const [isSaving, setIsSaving] = useState(false);
  // O que falta preencher, dito DENTRO do formulário.
  //
  // Era um `notify` — o aviso de canto da aplicação —, que num formulário
  // aberto por cima de outro (o cadastro de cliente chamado de dentro da OS)
  // aparece atrás do modal. Quem clicava em salvar via a aba trocar sozinha e
  // nada acontecer, sem nenhuma explicação na tela.
  const [erroForm, setErroForm] = useState("");

  // A moto do cliente. Numa oficina não existe cliente sem moto: sem a placa
  // vinculada, a próxima OS dessa pessoa não a encontra pela busca por placa —
  // que é como o balcão procura quando a moto chega.
  const [motoPlate, setMotoPlate] = useState("");
  const [motoBrand, setMotoBrand] = useState("Honda");
  const [motoModel, setMotoModel] = useState("");
  const [motoVersion, setMotoVersion] = useState("");
  const [motoYear, setMotoYear] = useState("");
  const [motoColor, setMotoColor] = useState("");
  const brandOptions = brands.length ? brands : defaultSystemLists.motorcycleBrands;
  // Cliente que já tem moto no sistema não precisa cadastrar outra para ser
  // salvo — a exigência é ter pelo menos uma, não uma a cada edição.
  const jaTemMoto = Boolean(editingClient && allMotorcycles.some((moto) => moto.ownerId === editingClient.id));

  // Form Fields
  const [name, setName] = useState("");
  const [type, setType] = useState<"Pessoa física" | "Empresa">("Pessoa física");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [condition, setCondition] = useState<"Pagamento normal" | "Cliente a prazo" | "Troca de serviços">("Pagamento normal");
  const [creditLimit, setCreditLimit] = useState<number>(500);
  const [tradeDetails, setTradeDetails] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    if (editingClient) {
      setName(editingClient.name || "");
      setType(editingClient.type || "Pessoa física");
      setDocument(editingClient.document || "");
      setPhone(editingClient.phone || "");
      setEmail(editingClient.email || "");
      setAddress(editingClient.address || "");
      setCondition((editingClient.condition as "Pagamento normal" | "Cliente a prazo" | "Troca de serviços") || "Pagamento normal");
      setCreditLimit(editingClient.creditLimit ?? 500);
      setTradeDetails(editingClient.tradeDetails || "");
      setNotes(editingClient.notes || "");
      setActive(editingClient.active !== false);
    } else {
      setName("");
      setType("Pessoa física");
      setDocument("");
      setPhone("");
      setEmail("");
      setAddress("");
      setCondition("Pagamento normal");
      setCreditLimit(500);
      setTradeDetails("");
      setNotes("");
      setActive(true);
    }
    setErroForm("");
      setMotoPlate(defaultMotorcycle?.plate ? formatPlate(defaultMotorcycle.plate) : "");
      setMotoBrand(defaultMotorcycle?.brand || "Honda");
      setMotoModel(defaultMotorcycle?.model || "");
      setMotoVersion(defaultMotorcycle?.version || "");
      setMotoYear(defaultMotorcycle?.year || "");
      setMotoColor(defaultMotorcycle?.color || "");
    setActiveTab("ident");
  }, [isOpen, editingClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErroForm("Informe o nome do cliente.");
      setActiveTab("ident");
      return;
    }

    if (!phone.trim()) {
      setErroForm("Informe o WhatsApp ou telefone do cliente.");
      setActiveTab("contact");
      return;
    }

    // A moto é obrigatória para quem ainda não tem nenhuma: sem placa vinculada,
    // a próxima OS deste cliente não o encontra pela busca por placa.
    if (!jaTemMoto && !motoPlate.trim()) {
      setErroForm("Informe a placa da moto deste cliente. Toda pessoa cadastrada precisa de pelo menos uma moto vinculada.");
      setActiveTab("ident");
      return;
    }
    if (motoPlate.trim() && !isValidPlate(motoPlate)) {
      setErroForm("A placa não está num dos padrões brasileiros (ABC-1234 ou ABC-1D23).");
      setActiveTab("ident");
      return;
    }
    // Placa que já é de outro cliente seria roubada em silêncio: o id da moto
    // sai da placa, e gravar por cima trocaria o dono da moto de alguém.
    const donoAtual = allMotorcycles.find((moto) => samePlate(moto.plate, motoPlate));
    if (motoPlate.trim() && donoAtual && donoAtual.ownerId && donoAtual.ownerId !== editingClient?.id) {
      const nomeDoDono = allClients.find((cliente) => cliente.id === donoAtual.ownerId)?.name;
      setErroForm(`A placa ${formatPlate(motoPlate)} já está cadastrada${nomeDoDono ? ` no nome de ${nomeDoDono}` : ""}. Confira a placa ou edite a moto pelo cadastro de motocicletas.`);
      setActiveTab("ident");
      return;
    }

    setErroForm("");
    setIsSaving(true);
    try {
      const clientId = editingClient?.id || nextSequentialId(allClients, "CLI");
      const motoId = motoPlate.trim() ? motorcycleIdFor(motoPlate) : "";

      const clientData: ClientRecord = {
        id: clientId,
        name: name.trim(),
        type,
        document: document.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        condition,
        creditLimit: condition === "Cliente a prazo" ? Number(creditLimit) || 0 : undefined,
        tradeDetails: condition === "Troca de serviços" ? tradeDetails.trim() : undefined,
        motorcycleIds: motoId
          ? [...new Set([...(editingClient?.motorcycleIds || []), motoId])]
          : (editingClient?.motorcycleIds || []),
        detail: condition === "Cliente a prazo" ? `A prazo (Limite: R$ ${creditLimit})` : (condition === "Troca de serviços" ? "Troca de serviços" : "Pagamento no ato"),
        meta: type === "Empresa" ? "Pessoa Jurídica" : "Pessoa Física",
        notes: notes.trim(),
        active,
      };

      await saveFirestoreDoc("clients", clientId, {
        name: clientData.name,
        type: clientData.type,
        document: clientData.document,
        phone: clientData.phone,
        email: clientData.email,
        address: clientData.address,
        condition: clientData.condition,
        creditLimit: clientData.creditLimit,
        tradeDetails: clientData.tradeDetails,
        motorcycleIds: clientData.motorcycleIds,
        detail: clientData.detail,
        meta: clientData.meta,
        notes: clientData.notes,
        active: clientData.active,
      });

      // A moto vai junto, no mesmo salvar. Gravar o cliente e deixar a moto
      // para depois deixaria a oficina com um cliente sem moto — exatamente o
      // que esta tela passou a impedir.
      if (motoId) {
        await saveFirestoreDoc("motorcycles", motoId, {
          ownerId: clientId,
          ownerName: clientData.name,
          plate: formatPlate(motoPlate),
          brand: motoBrand,
          model: fullModelName(motoModel, motoVersion),
          year: motoYear.trim(),
          color: motoColor.trim(),
        });
      }

      onSaved(clientData);
      notify(editingClient
        ? "Cliente atualizado com sucesso!"
        : `Cliente cadastrado${motoId ? ` com a moto ${formatPlate(motoPlate)}` : ""} com sucesso!`);
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar cliente:", err);
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar o cliente. Verifique a conexão e tente de novo.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window large-dialog" style={{ maxWidth: "740px" }}>
        <div className="dialog-head">
          <div>
            <strong>{editingClient ? "Editar Cliente" : "Novo Cliente"}</strong>
            <span>{editingClient ? `${editingClient.name} · ${editingClient.phone}` : "Cadastro completo de clientes para histórico de OS e balcão"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <div className="dialog-tabs">
          <button type="button" className={`dialog-tab ${activeTab === "ident" ? "active" : ""}`} onClick={() => setActiveTab("ident")}>
            1. Dados Pessoais
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "contact" ? "active" : ""}`} onClick={() => setActiveTab("contact")}>
            2. Contato
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "address" ? "active" : ""}`} onClick={() => setActiveTab("address")}>
            3. Endereço
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "financial" ? "active" : ""}`} onClick={() => setActiveTab("financial")}>
            4. Financeiro & Crediário
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "notes" ? "active" : ""}`} onClick={() => setActiveTab("notes")}>
            5. Observações
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          {erroForm ? <div className="settings-modal-error" role="alert"><b>!</b><span>{erroForm}</span></div> : null}
          {/* TAB 1: IDENTIFICAÇÃO */}
          {activeTab === "ident" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Nome Completo / Razão Social <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo dos Santos"
                    className="dialog-input"
                    autoFocus
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Tipo de Cadastro</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as "Pessoa física" | "Empresa")}
                    className="dialog-select"
                  >
                    <option value="Pessoa física">Pessoa Física (CPF)</option>
                    <option value="Empresa">Empresa / Frota (CNPJ)</option>
                  </select>
                </label>
              </div>

              {/*
                Numa oficina não existe cliente sem moto. Sem a placa vinculada,
                a próxima OS dessa pessoa não a encontra pela busca por placa —
                que é como o balcão procura quando a moto chega no portão.

                Quem já tem moto cadastrada não precisa informar outra: a
                exigência é ter pelo menos uma, não uma a cada edição.
              */}
              <section className="client-moto-block">
                <header>
                  <div><strong>Motocicleta do cliente</strong><small>{jaTemMoto ? "Este cliente já tem moto cadastrada. Preencha só se quiser adicionar outra." : "Toda pessoa cadastrada precisa de pelo menos uma moto vinculada."}</small></div>
                  {jaTemMoto ? <span className="status-badge green">Já vinculada</span> : <span className="status-badge">Obrigatória</span>}
                </header>
                <div className="form-grid-3">
                  <label className="field-group">
                    <span className="field-label">Placa {jaTemMoto ? null : <b className="req">*</b>}</span>
                    <input
                      type="text"
                      value={motoPlate}
                      onChange={(e) => setMotoPlate(formatPlate(e.target.value))}
                      placeholder="ABC-1234 ou ABC-1D23"
                      maxLength={8}
                      className="dialog-input"
                    />
                    <span className="settings-hint">{motoPlate ? platePattern(motoPlate) : "Padrão antigo ou Mercosul."}</span>
                  </label>
                  <label className="field-group">
                    <span className="field-label">Marca</span>
                    <select value={motoBrand} onChange={(e) => { setMotoBrand(e.target.value); setMotoModel(""); setMotoVersion(""); }} className="dialog-select">
                      {brandOptions.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                    </select>
                  </label>
                  <label className="field-group">
                    <span className="field-label">Modelo</span>
                    {modelsOf(motoBrand).length ? (
                      <select value={motoModel} onChange={(e) => { setMotoModel(e.target.value); setMotoVersion(""); }} className="dialog-select">
                        <option value="">Escolha o modelo</option>
                        {modelsOf(motoBrand).map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={motoModel} onChange={(e) => setMotoModel(e.target.value)} placeholder="Ex: CG 160 Fan" className="dialog-input"/>
                    )}
                  </label>
                  <label className="field-group">
                    <span className="field-label">Versão</span>
                    {versionsOf(motoBrand, motoModel).length ? (
                      <select value={motoVersion} onChange={(e) => setMotoVersion(e.target.value)} className="dialog-select">
                        <option value="">Sem versão específica</option>
                        {versionsOf(motoBrand, motoModel).map((nome) => <option key={nome} value={nome}>{nome}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={motoVersion} onChange={(e) => setMotoVersion(e.target.value)} placeholder="Ex: ESDI" className="dialog-input"/>
                    )}
                  </label>
                  <label className="field-group">
                    <span className="field-label">Ano / modelo</span>
                    <input type="text" value={motoYear} onChange={(e) => setMotoYear(e.target.value)} placeholder="2024 / 2025" className="dialog-input"/>
                  </label>
                  <label className="field-group">
                    <span className="field-label">Cor</span>
                    <input type="text" value={motoColor} onChange={(e) => setMotoColor(e.target.value)} placeholder="Ex: Vermelha" className="dialog-input"/>
                  </label>
                </div>
              </section>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">{type === "Empresa" ? "CNPJ" : "CPF"}</span>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder={type === "Empresa" ? "00.000.000/0001-00" : "000.000.000-00"}
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: CONTATO */}
          {activeTab === "contact" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">WhatsApp / Celular <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="dialog-input bold-number"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">E-mail</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: ENDEREÇO */}
          {activeTab === "address" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Endereço Completo (Rua, Número, Bairro, Cidade)</span>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Rua das Palmeiras, 342 - Centro"
                  className="dialog-input"
                />
              </label>
            </div>
          )}

          {/* TAB 4: FINANCEIRO & CREDIÁRIO */}
          {activeTab === "financial" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Condição de Pagamento e Relacionamento</span>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as "Pagamento normal" | "Cliente a prazo" | "Troca de serviços")}
                  className="dialog-select"
                >
                  <option value="Pagamento normal">Pagamento Normal (À vista ou Cartão no ato)</option>
                  <option value="Cliente a prazo">Cliente a Prazo / Crediário (Permitir fiado com limite)</option>
                  <option value="Troca de serviços">Conta de Troca de Serviços (Permuta / Parceria)</option>
                </select>
              </label>

              {condition === "Cliente a prazo" && (
                <div className="alert-card" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <label className="field-group">
                    <span className="field-label">Limite de Crédito Autorizado (R$)</span>
                    <NumberField
                      step="0.01"
                      min={0}
                      fallback={0}
                      value={creditLimit}
                      onChange={(valor) => setCreditLimit(valor)}
                      placeholder="500,00"
                      className="dialog-input bold-number"
                    />
                    <small className="field-hint">O sistema alertará o balcão caso a soma de ordens abertas ultrapasse este limite.</small>
                  </label>
                </div>
              )}

              {condition === "Troca de serviços" && (
                <div className="alert-card" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <label className="field-group">
                    <span className="field-label">Detalhes da Parceria / Permuta</span>
                    <input
                      type="text"
                      value={tradeDetails}
                      onChange={(e) => setTradeDetails(e.target.value)}
                      placeholder="Ex: Parceria de marketing / Troca de peças por serviços de guincho"
                      className="dialog-input"
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: OBSERVAÇÕES */}
          {activeTab === "notes" && (
            <div className="form-section-stack">
              <label className="field-group">
                <span className="field-label">Observações e Preferências do Cliente</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Prefere ser avisado no WhatsApp quando a moto estiver pronta. Cliente exigente com limpeza da moto."
                  className="dialog-textarea"
                />
              </label>

              <div className="toggle-row-card">
                <div>
                  <strong>Cliente Ativo</strong>
                  <span>Habilitar para novas Ordens de Serviço e vendas</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>
          )}

          <div className="dialog-actions-row">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <div style={{ display: "flex", gap: "8px" }}>
              {activeTab !== "ident" && (
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => {
                    const tabs: Array<"ident" | "contact" | "address" | "financial" | "notes"> = ["ident", "contact", "address", "financial", "notes"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx > 0) setActiveTab(tabs[currIdx - 1]);
                  }}
                >
                  Anterior
                </button>
              )}
              {/*
                Os dois botões ficam SEMPRE na tela, cada um no seu lugar.

                Antes o mesmo canto trocava de botão: era "Próxima etapa" e, ao
                avançar para a última etapa, virava o de gravar no mesmo pixel.
                Dois cliques seguidos — o que se faz num botão que parece não ter
                respondido — avançavam e gravavam em seguida: o cadastro saía
                pela metade e a tela fechava sozinha. Na última etapa o "Próxima
                etapa" fica desabilitado em vez de sumir, para nada mudar de
                posição debaixo do cursor.
              */}
              <button
                type="button"
                className="outline-button"
                disabled={activeTab === "notes"}
                  onClick={() => {
                    const tabs: Array<"ident" | "contact" | "address" | "financial" | "notes"> = ["ident", "contact", "address", "financial", "notes"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
                  }}
              >
                Próxima etapa →
              </button>
                <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
                  {isSaving ? "Salvando no Firestore..." : (editingClient ? "Salvar Alterações" : "Cadastrar Cliente")}
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
