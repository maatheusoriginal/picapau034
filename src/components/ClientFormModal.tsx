import React, { useState, useEffect } from "react";
import type { ClientRecord } from "../types";
import { saveFirestoreDoc } from "../../app/firebase/client";

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (client: ClientRecord) => void;
  editingClient?: ClientRecord | null;
  notify: (msg: string) => void;
  allClients: ClientRecord[];
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingClient,
  notify,
  allClients,
}) => {
  const [activeTab, setActiveTab] = useState<"ident" | "contact" | "address" | "financial" | "notes">("ident");
  const [isSaving, setIsSaving] = useState(false);

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
      setCondition((editingClient.condition as any) || "Pagamento normal");
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
    setActiveTab("ident");
  }, [isOpen, editingClient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      notify("Informe o nome do cliente.");
      setActiveTab("ident");
      return;
    }

    if (!phone.trim()) {
      notify("Informe o WhatsApp ou telefone do cliente.");
      setActiveTab("contact");
      return;
    }

    setIsSaving(true);
    try {
      const clientId = editingClient?.id || `CLI-${String(allClients.length + 1).padStart(3, "0")}`;

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
        motorcycleIds: editingClient?.motorcycleIds || [],
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

      onSaved(clientData);
      notify(editingClient ? "Cliente atualizado com sucesso!" : "Cliente cadastrado com sucesso!");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar cliente:", err);
      notify(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
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
                    onChange={(e) => setType(e.target.value as any)}
                    className="dialog-select"
                  >
                    <option value="Pessoa física">Pessoa Física (CPF)</option>
                    <option value="Empresa">Empresa / Frota (CNPJ)</option>
                  </select>
                </label>
              </div>

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
                  onChange={(e) => setCondition(e.target.value as any)}
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
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={creditLimit}
                      onChange={(e) => setCreditLimit(parseFloat(e.target.value) || 0)}
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
              {activeTab !== "notes" ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    const tabs: Array<"ident" | "contact" | "address" | "financial" | "notes"> = ["ident", "contact", "address", "financial", "notes"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
                  }}
                >
                  Próxima etapa →
                </button>
              ) : (
                <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
                  {isSaving ? "Salvando no Firestore..." : (editingClient ? "Salvar Alterações" : "Cadastrar Cliente")}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
