import React, { useState, useEffect } from "react";
import type { UserConfig } from "../types";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { NumberField } from "./NumberField";
import { nextSequentialId } from "../firestore-data";

interface EmployeeFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (employee: UserConfig) => void;
  editingEmployee?: UserConfig | null;
  notify: (msg: string) => void;
  allEmployees: UserConfig[];
}

export const EmployeeFormModal: React.FC<EmployeeFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingEmployee,
  notify,
  allEmployees,
}) => {
  // A aba "notes" não existe: não há botão que a selecione nem bloco que a
  // renderize, então deixá-la no union só fazia a navegação Anterior/Próxima
  // deixar de compilar.
  const [activeTab, setActiveTab] = useState<"ident" | "salary" | "workshop">("ident");
  const [isSaving, setIsSaving] = useState(false);
  // O que falta preencher, dito DENTRO do formulário.
  //
  // Era um `notify` — o aviso de canto da aplicação —, que num formulário
  // aberto por cima de outro (o cadastro de cliente chamado de dentro da OS)
  // aparece atrás do modal. Quem clicava em salvar via a aba trocar sozinha e
  // nada acontecer, sem nenhuma explicação na tela.
  const [erroForm, setErroForm] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [position, setPosition] = useState("Mecânico");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [employmentType, setEmploymentType] = useState<"Fixo" | "Avulso">("Fixo");
  const [baseSalary, setBaseSalary] = useState<number>(2500);
  const [paymentDay, setPaymentDay] = useState<number>(5);
  const [serviceCommission, setServiceCommission] = useState<number>(10);
  const [productCommission, setProductCommission] = useState<number>(0);
  const [isMechanic, setIsMechanic] = useState(true);
  const [isResponsibleMechanic, setIsResponsibleMechanic] = useState(false);
  const [canReceiveServiceOrders, setCanReceiveServiceOrders] = useState(true);
  const [canManageAllOrders, setCanManageAllOrders] = useState(false);
  const [active, setActive] = useState(true);

  const positionOptions = [
    "Mecânico",
    "Responsável pela oficina",
    "Atendente de Balcão",
    "Auxiliar de Mecânica",
    "Eletricista de Motos",
    "Gerente de Peças",
    "Dono / Mecânico",
  ];

  const handlePositionChange = (newPos: string) => {
    setPosition(newPos);
    const posLower = newPos.toLowerCase();
    const isMechPos = posLower.includes("mecanic") || posLower.includes("mecânic") || posLower.includes("eletricista") || posLower.includes("auxiliar");
    const isRespPos = posLower.includes("responsável") || posLower.includes("responsavel") || posLower.includes("dono") || posLower.includes("gerente");

    if (isMechPos) {
      setIsMechanic(true);
      setCanReceiveServiceOrders(true);
    }
    if (isRespPos) {
      setIsResponsibleMechanic(true);
      setIsMechanic(true);
      setCanReceiveServiceOrders(true);
      setCanManageAllOrders(true);
    }
  };

  useEffect(() => {
    if (!isOpen) return;

    if (editingEmployee) {
      const isMech = editingEmployee.isMechanic === true
        || editingEmployee.canReceiveServiceOrders === true
        || (typeof editingEmployee.position === "string" && (editingEmployee.position.toLowerCase().includes("mecanic") || editingEmployee.position.toLowerCase().includes("mecânic")));
      const isResp = editingEmployee.isResponsibleMechanic === true
        || (typeof editingEmployee.position === "string" && (editingEmployee.position.toLowerCase().includes("responsável") || editingEmployee.position.toLowerCase().includes("responsavel") || editingEmployee.position.toLowerCase().includes("dono")));

      setName(editingEmployee.name || "");
      setPosition(editingEmployee.position || "Mecânico");
      setPhone(editingEmployee.phone || "");
      setDocument(editingEmployee.document || "");
      setEmploymentType(editingEmployee.employmentType || "Fixo");
      setBaseSalary(editingEmployee.baseSalary ?? 2500);
      setPaymentDay(editingEmployee.paymentDay ?? 5);
      setServiceCommission(editingEmployee.serviceCommission ?? (isMech ? 10 : 0));
      setProductCommission(editingEmployee.productCommission ?? 0);
      setIsMechanic(isMech);
      setIsResponsibleMechanic(isResp);
      setCanReceiveServiceOrders(isMech);
      setCanManageAllOrders(editingEmployee.canManageAllOrders === true || isResp);
      setActive(editingEmployee.active !== false);
    } else {
      setName("");
      setPosition("Mecânico");
      setPhone("");
      setDocument("");
      setEmploymentType("Fixo");
      setBaseSalary(2500);
      setPaymentDay(5);
      setServiceCommission(10);
      setProductCommission(0);
      setIsMechanic(true);
      setIsResponsibleMechanic(false);
      setCanReceiveServiceOrders(true);
      setCanManageAllOrders(false);
      setActive(true);
    }
    setErroForm("");
    setActiveTab("ident");
  }, [isOpen, editingEmployee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErroForm("Informe o nome do funcionário.");
      setActiveTab("ident");
      return;
    }

    setErroForm("");
    setIsSaving(true);
    try {
      const employeeId = editingEmployee?.id || nextSequentialId(allEmployees, "USR");

      const employeeData: UserConfig = {
        id: employeeId,
        name: name.trim(),
        role: isMechanic ? "Mecânico" : (position.includes("Responsável") || position.includes("Gerente") ? "Super Admin" : "Balcão"),
        position: position.trim(),
        phone: phone.trim(),
        document: document.trim(),
        active,
        isMechanic: Boolean(isMechanic),
        isResponsibleMechanic: Boolean(isResponsibleMechanic),
        canReceiveServiceOrders: Boolean(isMechanic),
        canManageAllOrders: Boolean(canManageAllOrders || isResponsibleMechanic),
        employmentType,
        baseSalary: Number(baseSalary) || 0,
        paymentDay: Number(paymentDay) || 5,
        serviceCommission: Number(serviceCommission) || 0,
        productCommission: Number(productCommission) || 0,
        currentOrders: editingEmployee?.currentOrders ?? 0,
        userId: editingEmployee?.userId,
      };

      // Save public employee profile in "employees" collection
      await saveFirestoreDoc("employees", employeeId, {
        name: employeeData.name,
        position: employeeData.position,
        role: employeeData.role,
        isMechanic: employeeData.isMechanic,
        isResponsibleMechanic: employeeData.isResponsibleMechanic,
        canReceiveServiceOrders: employeeData.canReceiveServiceOrders,
        canManageAllOrders: employeeData.canManageAllOrders,
        phone: employeeData.phone,
        document: employeeData.document,
        employmentType: employeeData.employmentType,
        serviceCommission: employeeData.serviceCommission,
        productCommission: employeeData.productCommission,
        active: employeeData.active,
        ...(employeeData.userId ? { userId: employeeData.userId } : {}),
      });

      // Save confidential salary and payment day in "employeeCompensation" collection
      await saveFirestoreDoc("employeeCompensation", employeeId, {
        baseSalary: employeeData.baseSalary,
        paymentDay: employeeData.paymentDay,
      });

      onSaved(employeeData);
      notify(editingEmployee ? "Funcionário atualizado com sucesso!" : "Funcionário cadastrado com sucesso!");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar funcionário:", err);
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar o funcionário. Verifique a conexão e tente de novo.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window large-dialog" style={{ maxWidth: "700px" }}>
        <div className="dialog-head">
          <div>
            <strong>{editingEmployee ? "Editar Membro da Equipe" : "Novo Membro da Equipe"}</strong>
            <span>{editingEmployee ? `${editingEmployee.name} · ${editingEmployee.position}` : "Cadastre mecânicos, atendentes e responsáveis da oficina"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <div className="dialog-tabs">
          <button type="button" className={`dialog-tab ${activeTab === "ident" ? "active" : ""}`} onClick={() => setActiveTab("ident")}>
            1. Identificação
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "salary" ? "active" : ""}`} onClick={() => setActiveTab("salary")}>
            2. Remuneração & Comissão
          </button>
          <button type="button" className={`dialog-tab ${activeTab === "workshop" ? "active" : ""}`} onClick={() => setActiveTab("workshop")}>
            3. Oficina & Permissões
          </button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          {erroForm ? <div className="settings-modal-error" role="alert"><b>!</b><span>{erroForm}</span></div> : null}
          {/* TAB 1: IDENTIFICAÇÃO */}
          {activeTab === "ident" && (
            <div className="form-section-stack">
              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Nome Completo <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Roberto Silva"
                    className="dialog-input"
                    autoFocus
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Cargo / Função na Oficina <b className="req">*</b></span>
                  <select
                    value={position}
                    onChange={(e) => handlePositionChange(e.target.value)}
                    className="dialog-select"
                  >
                    {positionOptions.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">WhatsApp / Telefone</span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(11) 98765-4321"
                    className="dialog-input"
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">CPF</span>
                  <input
                    type="text"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    placeholder="000.000.000-00"
                    className="dialog-input"
                  />
                </label>
              </div>
            </div>
          )}

          {/* TAB 2: REMUNERAÇÃO */}
          {activeTab === "salary" && (
            <div className="form-section-stack">
              <div className="form-grid-3">
                <label className="field-group">
                  <span className="field-label">Tipo de Contrato</span>
                  <select
                    value={employmentType}
                    onChange={(e) => setEmploymentType(e.target.value as "Fixo" | "Avulso")}
                    className="dialog-select"
                  >
                    <option value="Fixo">Fixo (Mensalista)</option>
                    <option value="Avulso">Avulso (Por diária ou serviço)</option>
                  </select>
                </label>

                <label className="field-group">
                  <span className="field-label">Salário Base (R$)</span>
                  <NumberField
                    step="0.01"
                    min={0}
                    fallback={0}
                    blankValue={0}
                    value={baseSalary}
                    onChange={(valor) => setBaseSalary(valor)}
                    placeholder="0,00"
                    className="dialog-input bold-number"
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">Dia de Pagamento</span>
                  <NumberField
                    min={1}
                    max={31}
                    fallback={5}
                    value={paymentDay}
                    onChange={(valor) => setPaymentDay(valor)}
                    className="dialog-input"
                  />
                  <small className="field-hint">Ex: Dia 5 de cada mês</small>
                </label>
              </div>

              <div className="form-grid-2">
                <label className="field-group">
                  <span className="field-label">Comissão em Serviços (%)</span>
                  <NumberField
                    step="0.5"
                    min={0}
                    max={100}
                    fallback={0}
                    value={serviceCommission}
                    onChange={(valor) => setServiceCommission(valor)}
                    className="dialog-input bold-number"
                  />
                  <small className="field-hint">Percentual sobre a mão de obra das OS executadas</small>
                </label>

                <label className="field-group">
                  <span className="field-label">Comissão em Peças / Vendas (%)</span>
                  <NumberField
                    step="0.5"
                    min={0}
                    max={100}
                    fallback={0}
                    value={productCommission}
                    onChange={(valor) => setProductCommission(valor)}
                    className="dialog-input"
                  />
                  <small className="field-hint">Percentual sobre peças vendidas no balcão ou OS</small>
                </label>
              </div>
            </div>
          )}

          {/* TAB 3: OFICINA & PERMISSÕES */}
          {activeTab === "workshop" && (
            <div className="form-section-stack">
              <div className="toggle-row-card">
                <div>
                  <strong>Mecânico da Oficina</strong>
                  <span>Habilita este profissional para seleção nas Ordens de Serviço, Avaliações, Diagnósticos e Serviço Rápido</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={isMechanic}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsMechanic(next);
                      setCanReceiveServiceOrders(next);
                      if (!next) setIsResponsibleMechanic(false);
                    }}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="toggle-row-card">
                <div>
                  <strong>Mecânico Responsável</strong>
                  <span>Define como mecânico líder/responsável técnico da oficina (aparece com destaque de "Responsável" nas OS)</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={isResponsibleMechanic}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setIsResponsibleMechanic(next);
                      if (next) {
                        setIsMechanic(true);
                        setCanReceiveServiceOrders(true);
                      }
                    }}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="toggle-row-card">
                <div>
                  <strong>Pode gerenciar todas as OS da oficina</strong>
                  <span>Permite ver e alterar OS designadas para outros mecânicos</span>
                </div>
                <label className="switch-toggle">
                  <input
                    type="checkbox"
                    checked={canManageAllOrders}
                    onChange={(e) => setCanManageAllOrders(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              <div className="toggle-row-card">
                <div>
                  <strong>Funcionário Ativo</strong>
                  <span>Funcionários inativos não aparecem para novas OS ou lançamentos</span>
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
                    const tabs: Array<"ident" | "salary" | "workshop"> = ["ident", "salary", "workshop"];
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
                disabled={activeTab === "workshop"}
                  onClick={() => {
                    const tabs: Array<"ident" | "salary" | "workshop"> = ["ident", "salary", "workshop"];
                    const currIdx = tabs.indexOf(activeTab);
                    if (currIdx < tabs.length - 1) setActiveTab(tabs[currIdx + 1]);
                  }}
              >
                Próxima etapa →
              </button>
                <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
                  {isSaving ? "Salvando no Firestore..." : (editingEmployee ? "Salvar Alterações" : "Cadastrar Funcionário")}
                </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
