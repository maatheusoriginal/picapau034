import React, { useState, useEffect } from "react";
import type {
  CategoryConfig,
  PartnerConfig,
  PaymentMachineConfig,
  PaymentMethodConfig,
  QuickServiceConfig,
  SettingsConfig,
  SystemLists,
} from "../types";
import { defaultSystemLists, systemList, systemListLabels } from "../types";
import { saveFirestoreDoc, deleteFirestoreDoc, observeFirestoreDoc } from "../../app/firebase/client";

interface SettingsWorkspaceProps {
  quickServices: QuickServiceConfig[];
  setQuickServices: React.Dispatch<React.SetStateAction<QuickServiceConfig[]>>;
  categories: CategoryConfig[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryConfig[]>>;
  paymentMachines: PaymentMachineConfig[];
  setPaymentMachines: React.Dispatch<React.SetStateAction<PaymentMachineConfig[]>>;
  paymentMethods: PaymentMethodConfig[];
  setPaymentMethods: React.Dispatch<React.SetStateAction<PaymentMethodConfig[]>>;
  partners: PartnerConfig[];
  setPartners: React.Dispatch<React.SetStateAction<PartnerConfig[]>>;
  notify: (msg: string) => void;
  /** Aba aberta ao entrar na tela. O painel /admin usa isto para levar direto ao grupo escolhido. */
  initialTab?: SettingsTab;
}

export type SettingsTab = "general" | "services" | "categories" | "payments" | "partners" | "stock" | "print" | "lists";

export const SettingsWorkspace: React.FC<SettingsWorkspaceProps> = ({
  quickServices,
  setQuickServices,
  categories,
  setCategories,
  paymentMachines,
  setPaymentMachines,
  paymentMethods,
  setPaymentMethods,
  partners,
  setPartners,
  notify,
  initialTab = "general",
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  // General Settings State
  const [generalSettings, setGeneralSettings] = useState<SettingsConfig>({
    workshopName: "Pica Pau Motos",
    tradeName: "Pica Pau Motos & Oficina Especializada",
    cnpj: "12.345.678/0001-90",
    phone: "(11) 98765-4321",
    secondaryPhone: "(11) 3344-5566",
    address: "Av. Principal das Motos, 1200 - Centro",
    osPrefix: "OS-",
    nextOsNumber: 1050,
    defaultWarrantyDays: 90,
    defaultDeliveryDays: "24 horas",
    defaultOsNotes: "Garantia de 90 dias sobre serviços executados e peças originais aplicadas. Peças elétricas com garantia direta do fabricante.",
    allowMultipleMechanics: true,
    showWorkload: true,
    defaultMinStock: 2,
    defaultUnit: "UN",
    suggestedMarkup: 45,
    blockZeroStockSale: false,
    deductStockOnlyWhenUsed: true,
    useAverageCost: false,
    thermalPrinter: "Elgin i9 / Não Fiscal",
    printFormat: "Cupom 80mm",
    printThreeCopies: true,
    defaultWhatsappMessage: "Olá {cliente}! Sua moto {moto} (Placa {placa}) já está com o orçamento pronto na Pica Pau Motos. Total: {total}. Deseja que iniciemos o serviço?",
  });

  // Observe general settings in Firestore
  useEffect(() => {
    const unsub = observeFirestoreDoc<SettingsConfig>("settings", "global", (data) => {
      if (data) {
        setGeneralSettings((prev) => ({ ...prev, ...data }));
      }
    });
    return () => unsub();
  }, []);

  // Listas do sistema (unidades, marcas, contas, prioridades...). Ficam em
  // settings/lists, ao lado de settings/global.
  const [lists, setLists] = useState<SystemLists>(defaultSystemLists);
  const [isSavingLists, setIsSavingLists] = useState(false);
  const [newListItem, setNewListItem] = useState<Partial<Record<keyof SystemLists, string>>>({});

  useEffect(() => {
    const unsub = observeFirestoreDoc<Partial<SystemLists>>("settings", "lists", (data) => {
      if (!data) return;
      setLists((prev) => {
        const next = { ...prev };
        (Object.keys(defaultSystemLists) as (keyof SystemLists)[]).forEach((key) => {
          next[key] = systemList(data, key);
        });
        return next;
      });
    });
    return () => unsub();
  }, []);

  const addListItem = (key: keyof SystemLists) => {
    const value = (newListItem[key] ?? "").trim();
    if (!value) return;
    if (lists[key].some((item) => item.toLowerCase() === value.toLowerCase())) {
      notify(`"${value}" já está na lista.`);
      return;
    }
    setLists({ ...lists, [key]: [...lists[key], value] });
    setNewListItem({ ...newListItem, [key]: "" });
  };

  const removeListItem = (key: keyof SystemLists, value: string) => {
    if (lists[key].length <= 1) {
      notify("A lista precisa ter ao menos uma opção.");
      return;
    }
    setLists({ ...lists, [key]: lists[key].filter((item) => item !== value) });
  };

  const handleSaveLists = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingLists(true);
    try {
      await saveFirestoreDoc("settings", "lists", lists);
      notify("Listas do sistema salvas com sucesso!");
    } catch (err: unknown) {
      console.error("Erro ao salvar listas:", err);
      notify("Erro ao salvar as listas do sistema.");
    } finally {
      setIsSavingLists(false);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGeneral(true);
    try {
      await saveFirestoreDoc("settings", "global", generalSettings);
      notify("Configurações da oficina salvas com sucesso!");
    } catch (err: unknown) {
      console.error("Erro ao salvar configurações:", err);
      notify("Erro ao salvar configurações gerais.");
    } finally {
      setIsSavingGeneral(false);
    }
  };

  // Quick Service Modal / Form State
  const [editingQuickService, setEditingQuickService] = useState<QuickServiceConfig | null>(null);
  const [isQuickServiceModalOpen, setIsQuickServiceModalOpen] = useState(false);
  const [qsName, setQsName] = useState("");
  const [qsLabor, setQsLabor] = useState<number>(35);
  const [qsDuration, setQsDuration] = useState<number>(20);
  const [qsCategory, setQsCategory] = useState("Lubrificantes e Fluidos");
  const [qsRequired, setQsRequired] = useState(true);
  const [qsActive, setQsActive] = useState(true);

  const openQuickServiceModal = (service?: QuickServiceConfig) => {
    if (service) {
      setEditingQuickService(service);
      setQsName(service.name);
      setQsLabor(service.laborPrice);
      setQsDuration(service.duration);
      setQsCategory(service.productCategory);
      setQsRequired(service.productRequired);
      setQsActive(service.active !== false);
    } else {
      setEditingQuickService(null);
      setQsName("");
      setQsLabor(35);
      setQsDuration(20);
      setQsCategory("Lubrificantes e Fluidos");
      setQsRequired(true);
      setQsActive(true);
    }
    setIsQuickServiceModalOpen(true);
  };

  const handleSaveQuickService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qsName.trim()) {
      notify("Informe o nome do serviço rápido.");
      return;
    }

    const qsId = editingQuickService?.id || `QS-${Date.now()}`;
    const newService: QuickServiceConfig = {
      id: qsId,
      name: qsName.trim(),
      laborPrice: Number(qsLabor) || 0,
      duration: Number(qsDuration) || 15,
      productCategory: qsCategory.trim(),
      productRequired: qsRequired,
      active: qsActive,
    };

    try {
      await saveFirestoreDoc("quickServices", qsId, newService);
      setQuickServices((prev) => {
        const filtered = prev.filter((item) => item.id !== qsId);
        return [...filtered, newService].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      notify(editingQuickService ? "Serviço rápido atualizado!" : "Serviço rápido cadastrado com sucesso!");
      setIsQuickServiceModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao salvar serviço rápido.");
    }
  };

  const handleDeleteQuickService = async (id: string) => {
    if (!confirm("Deseja realmente remover este serviço rápido?")) return;
    try {
      await deleteFirestoreDoc("quickServices", id);
      setQuickServices((prev) => prev.filter((item) => item.id !== id));
      notify("Serviço rápido excluído.");
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao excluir serviço rápido.");
    }
  };

  // Category Modal State
  const [editingCategory, setEditingCategory] = useState<CategoryConfig | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catGroup, setCatGroup] = useState<"Serviços" | "Produtos" | "Despesas">("Produtos");
  const [catActive, setCatActive] = useState(true);

  const openCategoryModal = (cat?: CategoryConfig) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatGroup(cat.group);
      setCatActive(cat.active !== false);
    } else {
      setEditingCategory(null);
      setCatName("");
      setCatGroup("Produtos");
      setCatActive(true);
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      notify("Informe o nome da categoria.");
      return;
    }

    const catId = editingCategory?.id || `CAT-${Date.now()}`;
    const newCat: CategoryConfig = {
      id: catId,
      name: catName.trim(),
      group: catGroup,
      active: catActive,
    };

    try {
      await saveFirestoreDoc("categories", catId, newCat);
      setCategories((prev) => {
        const filtered = prev.filter((item) => item.id !== catId);
        return [...filtered, newCat].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      });
      notify(editingCategory ? "Categoria atualizada!" : "Categoria cadastrada com sucesso!");
      setIsCategoryModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao salvar categoria.");
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm("Deseja realmente excluir esta categoria?")) return;
    try {
      await deleteFirestoreDoc("categories", id);
      setCategories((prev) => prev.filter((item) => item.id !== id));
      notify("Categoria removida.");
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao excluir categoria.");
    }
  };

  // Payment Machine Modal State
  const [editingMachine, setEditingMachine] = useState<PaymentMachineConfig | null>(null);
  const [isMachineModalOpen, setIsMachineModalOpen] = useState(false);
  const [machName, setMachName] = useState("");
  const [machDebit, setMachDebit] = useState<number>(1.2);
  const [machCred1, setMachCred1] = useState<number>(2.5);
  const [machCred2, setMachCred2] = useState<number>(3.8);
  const [machCred7, setMachCred7] = useState<number>(6.5);
  const [machDays, setMachDays] = useState<number>(1);
  const [machPrimary, setMachPrimary] = useState(false);
  const [machActive, setMachActive] = useState(true);

  const openMachineModal = (mach?: PaymentMachineConfig) => {
    if (mach) {
      setEditingMachine(mach);
      setMachName(mach.name);
      setMachDebit(mach.debitFee);
      setMachCred1(mach.credit1xFee);
      setMachCred2(mach.credit2to6Fee);
      setMachCred7(mach.credit7to12Fee);
      setMachDays(mach.settlementDays);
      setMachPrimary(mach.primary === true);
      setMachActive(mach.active !== false);
    } else {
      setEditingMachine(null);
      setMachName("");
      setMachDebit(1.2);
      setMachCred1(2.5);
      setMachCred2(3.8);
      setMachCred7(6.5);
      setMachDays(1);
      setMachPrimary(false);
      setMachActive(true);
    }
    setIsMachineModalOpen(true);
  };

  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machName.trim()) {
      notify("Informe o nome ou operadora da maquininha.");
      return;
    }

    const machId = editingMachine?.id || `MACH-${Date.now()}`;
    const newMach: PaymentMachineConfig = {
      id: machId,
      name: machName.trim(),
      debitFee: Number(machDebit) || 0,
      credit1xFee: Number(machCred1) || 0,
      credit2to6Fee: Number(machCred2) || 0,
      credit7to12Fee: Number(machCred7) || 0,
      settlementDays: Number(machDays) || 1,
      primary: machPrimary,
      active: machActive,
    };

    try {
      await saveFirestoreDoc("paymentMachines", machId, newMach);
      setPaymentMachines((prev) => {
        const filtered = prev.filter((item) => item.id !== machId);
        return [...filtered, newMach];
      });
      notify(editingMachine ? "Maquininha atualizada!" : "Maquininha cadastrada com sucesso!");
      setIsMachineModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao salvar maquininha.");
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!confirm("Deseja realmente remover esta maquininha?")) return;
    try {
      await deleteFirestoreDoc("paymentMachines", id);
      setPaymentMachines((prev) => prev.filter((item) => item.id !== id));
      notify("Maquininha excluída.");
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao excluir maquininha.");
    }
  };

  // Partner Modal State
  const [editingPartner, setEditingPartner] = useState<PartnerConfig | null>(null);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [partName, setPartName] = useState("");
  const [partPhone, setPartPhone] = useState("");
  const [partDiscount, setPartDiscount] = useState<number>(10);
  const [partCycle, setPartCycle] = useState("Quinzenal (Dias 15 e 30)");
  const [partActive, setPartActive] = useState(true);

  const openPartnerModal = (partner?: PartnerConfig) => {
    if (partner) {
      setEditingPartner(partner);
      setPartName(partner.name);
      setPartPhone(partner.phone);
      setPartDiscount(partner.laborDiscount);
      setPartCycle(partner.billingCycle);
      setPartActive(partner.active !== false);
    } else {
      setEditingPartner(null);
      setPartName("");
      setPartPhone("");
      setPartDiscount(10);
      setPartCycle("Quinzenal (Dias 15 e 30)");
      setPartActive(true);
    }
    setIsPartnerModalOpen(true);
  };

  const handleSavePartner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partName.trim()) {
      notify("Informe o nome da empresa ou frota parceira.");
      return;
    }

    const partId = editingPartner?.id || `PART-${Date.now()}`;
    const newPartner: PartnerConfig = {
      id: partId,
      name: partName.trim(),
      phone: partPhone.trim(),
      laborDiscount: Number(partDiscount) || 0,
      billingCycle: partCycle.trim(),
      active: partActive,
    };

    try {
      await saveFirestoreDoc("partners", partId, newPartner);
      setPartners((prev) => {
        const filtered = prev.filter((item) => item.id !== partId);
        return [...filtered, newPartner];
      });
      notify(editingPartner ? "Parceiro atualizado!" : "Parceiro cadastrado com sucesso!");
      setIsPartnerModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao salvar parceiro.");
    }
  };

  const handleDeletePartner = async (id: string) => {
    if (!confirm("Deseja realmente excluir este parceiro?")) return;
    try {
      await deleteFirestoreDoc("partners", id);
      setPartners((prev) => prev.filter((item) => item.id !== id));
      notify("Parceiro removido.");
    } catch (err: unknown) {
      console.error(err);
      notify("Erro ao excluir parceiro.");
    }
  };

  return (
    <div className="settings-workspace-container">
      {/* Page Header */}
      <div className="module-heading">
        <div>
          <p>Configurações do Sistema</p>
          <h1>Configurações da Oficina</h1>
          <span>Personalize parâmetros da oficina, ordem de serviço, taxas, impressões e tabelas</span>
        </div>
      </div>

      {/* Main Settings Tab Bar */}
      <div className="settings-tabs-bar">
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "general" ? "active" : ""}`}
          onClick={() => setActiveTab("general")}
        >
          Oficina & OS
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "services" ? "active" : ""}`}
          onClick={() => setActiveTab("services")}
        >
          Serviços Rápidos <b>{quickServices.length}</b>
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "categories" ? "active" : ""}`}
          onClick={() => setActiveTab("categories")}
        >
          Categorias <b>{categories.length}</b>
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "payments" ? "active" : ""}`}
          onClick={() => setActiveTab("payments")}
        >
          Pagamentos & Taxas <b>{paymentMachines.length}</b>
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "partners" ? "active" : ""}`}
          onClick={() => setActiveTab("partners")}
        >
          Parceiros & Frotas <b>{partners.length}</b>
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "stock" ? "active" : ""}`}
          onClick={() => setActiveTab("stock")}
        >
          Estoque & Reposição
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "print" ? "active" : ""}`}
          onClick={() => setActiveTab("print")}
        >
          Impressão & WhatsApp
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === "lists" ? "active" : ""}`}
          onClick={() => setActiveTab("lists")}
        >
          Listas do sistema
        </button>
      </div>

      {/* TAB 1: GERAL & OS */}
      {activeTab === "general" && (
        <form onSubmit={handleSaveGeneral} className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Identificação da Oficina & Parâmetros de OS</h2>
              <p>Dados que saem nos orçamentos, ordens de serviço e comprovantes</p>
            </div>
            <button type="submit" className="primary-button" disabled={isSavingGeneral}>
              {isSavingGeneral ? "Salvando..." : "Salvar Configurações"}
            </button>
          </div>

          <div className="settings-card-body">
            <div className="settings-grid-2">
              <label className="settings-field">
                <span className="settings-field-label">Nome Fantasia da Oficina <b className="req">*</b></span>
                <input
                  type="text"
                  required
                  value={generalSettings.workshopName}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, workshopName: e.target.value })}
                  className="settings-input bold-val"
                  placeholder="Ex: Pica Pau Motos"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Razão Social</span>
                <input
                  type="text"
                  value={generalSettings.tradeName || ""}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, tradeName: e.target.value })}
                  className="settings-input"
                  placeholder="Ex: Pica Pau Motos & Oficina Especializada LTDA"
                />
              </label>
            </div>

            <div className="settings-grid-3">
              <label className="settings-field">
                <span className="settings-field-label">CNPJ / CPF</span>
                <input
                  type="text"
                  value={generalSettings.cnpj || ""}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, cnpj: e.target.value })}
                  className="settings-input"
                  placeholder="00.000.000/0001-00"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">WhatsApp Principal <b className="req">*</b></span>
                <input
                  type="text"
                  required
                  value={generalSettings.phone}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, phone: e.target.value })}
                  className="settings-input"
                  placeholder="(00) 00000-0000"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Telefone Fixo / Balcão</span>
                <input
                  type="text"
                  value={generalSettings.secondaryPhone || ""}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, secondaryPhone: e.target.value })}
                  className="settings-input"
                  placeholder="(00) 0000-0000"
                />
              </label>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">Endereço Completo da Oficina</span>
              <input
                type="text"
                value={generalSettings.address}
                onChange={(e) => setGeneralSettings({ ...generalSettings, address: e.target.value })}
                className="settings-input"
                placeholder="Rua, número, bairro, cidade - UF"
              />
            </label>

            <div className="settings-grid-4">
              <label className="settings-field">
                <span className="settings-field-label">Prefixo da OS</span>
                <input
                  type="text"
                  value={generalSettings.osPrefix}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, osPrefix: e.target.value })}
                  className="settings-input bold-val"
                  placeholder="OS-"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Próximo Número</span>
                <input
                  type="number"
                  value={generalSettings.nextOsNumber}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, nextOsNumber: parseInt(e.target.value, 10) || 1001 })}
                  className="settings-input bold-val"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Garantia Padrão (Dias)</span>
                <input
                  type="number"
                  value={generalSettings.defaultWarrantyDays}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultWarrantyDays: parseInt(e.target.value, 10) || 90 })}
                  className="settings-input"
                />
              </label>
              <label className="settings-field">
                <span className="settings-field-label">Previsão Padrão</span>
                <input
                  type="text"
                  value={generalSettings.defaultDeliveryDays}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultDeliveryDays: e.target.value })}
                  className="settings-input"
                  placeholder="24 horas"
                />
              </label>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">Termo de Garantia e Observação Padrão no Cupom/OS</span>
              <textarea
                value={generalSettings.defaultOsNotes}
                onChange={(e) => setGeneralSettings({ ...generalSettings, defaultOsNotes: e.target.value })}
                className="settings-textarea"
                rows={4}
                placeholder="Texto impresso no rodapé de orçamentos e ordens de serviço..."
              />
              <span className="settings-hint">Este texto será impresso automaticamente em todos os comprovantes emitidos.</span>
            </label>

            <div className="settings-grid-2">
              <div className="settings-toggle-box">
                <div>
                  <strong>Permitir múltiplos mecânicos por OS</strong>
                  <span>Habilita divisão de tarefas e comissões entre mecânicos</span>
                </div>
                <label className="switch-toggle-btn">
                  <input
                    type="checkbox"
                    checked={generalSettings.allowMultipleMechanics}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, allowMultipleMechanics: e.target.checked })}
                  />
                  <span className="switch-toggle-slider"></span>
                </label>
              </div>

              <div className="settings-toggle-box">
                <div>
                  <strong>Exibir carga de trabalho na triagem</strong>
                  <span>Mostra a fila de motos ativas de cada mecânico ao abrir a OS</span>
                </div>
                <label className="switch-toggle-btn">
                  <input
                    type="checkbox"
                    checked={generalSettings.showWorkload}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, showWorkload: e.target.checked })}
                  />
                  <span className="switch-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: SERVIÇOS RÁPIDOS */}
      {activeTab === "services" && (
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Tabela de Serviços Rápidos / Expresso</h2>
              <p>Serviços com preço fixo e duração estimada para agilidade no balcão</p>
            </div>
            <button type="button" className="primary-button" onClick={() => openQuickServiceModal()}>
              + Novo Serviço Rápido
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome do Serviço</th>
                  <th>Mão de Obra</th>
                  <th>Duração Estimada</th>
                  <th>Linha de Peça Associada</th>
                  <th>Peça Obrigatória?</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {quickServices.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty-state">
                        <strong>Nenhum serviço rápido cadastrado</strong>
                        <p>Cadastre serviços frequentes (como troca de óleo e relação) para agilizar o atendimento.</p>
                        <button type="button" className="outline-button" onClick={() => openQuickServiceModal()}>
                          + Cadastrar Primeiro Serviço
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  quickServices.map((qs) => (
                    <tr key={qs.id}>
                      <td><strong>{qs.name}</strong></td>
                      <td><strong style={{ color: "var(--green)" }}>R$ {qs.laborPrice.toFixed(2).replace(".", ",")}</strong></td>
                      <td>{qs.duration} min</td>
                      <td><span className="tag-badge blue">{qs.productCategory}</span></td>
                      <td>{qs.productRequired ? <span className="status-badge green">Sim</span> : <span className="status-badge gray">Opcional</span>}</td>
                      <td>{qs.active !== false ? <span className="status-badge green">Ativo</span> : <span className="status-badge red">Inativo</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button type="button" className="table-action-btn" onClick={() => openQuickServiceModal(qs)}>Editar</button>
                          <button type="button" className="table-action-btn delete" onClick={() => handleDeleteQuickService(qs.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CATEGORIAS */}
      {activeTab === "categories" && (
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Categorias Cadastradas</h2>
              <p>Estrutura de organização para produtos, serviços e despesas da oficina</p>
            </div>
            <button type="button" className="primary-button" onClick={() => openCategoryModal()}>
              + Nova Categoria
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome da Categoria</th>
                  <th>Grupo / Módulo</th>
                  <th>Situação</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty-state">
                        <strong>Nenhuma categoria cadastrada</strong>
                        <p>Crie categorias para classificar peças do estoque, tipos de serviços e despesas.</p>
                        <button type="button" className="outline-button" onClick={() => openCategoryModal()}>
                          + Cadastrar Primeira Categoria
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  categories.map((cat) => (
                    <tr key={cat.id}>
                      <td><strong>{cat.name}</strong></td>
                      <td>
                        <span className={`tag-badge ${cat.group === "Serviços" ? "blue" : (cat.group === "Produtos" ? "amber" : "violet")}`}>
                          {cat.group}
                        </span>
                      </td>
                      <td>{cat.active !== false ? <span className="status-badge green">Ativa</span> : <span className="status-badge red">Inativa</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button type="button" className="table-action-btn" onClick={() => openCategoryModal(cat)}>Editar</button>
                          <button type="button" className="table-action-btn delete" onClick={() => handleDeleteCategory(cat.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: PAGAMENTOS E TAXAS */}
      {activeTab === "payments" && (
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Maquininhas de Cartão e Taxas de Operação</h2>
              <p>Configure as taxas de débito e parcelamento para apuração do lucro real no caixa</p>
            </div>
            <button type="button" className="primary-button" onClick={() => openMachineModal()}>
              + Nova Maquininha
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Maquininha / Operadora</th>
                  <th>Taxa Débito</th>
                  <th>Crédito 1x</th>
                  <th>Crédito 2x a 6x</th>
                  <th>Crédito 7x a 12x</th>
                  <th>Prazo Repasse</th>
                  <th>Principal</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {paymentMachines.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="table-empty-state">
                        <strong>Nenhuma maquininha configurada</strong>
                        <p>Adicione as maquininhas de cartão da oficina com as taxas cobradas pela operadora.</p>
                        <button type="button" className="outline-button" onClick={() => openMachineModal()}>
                          + Cadastrar Maquininha
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paymentMachines.map((mach) => (
                    <tr key={mach.id}>
                      <td><strong>{mach.name}</strong></td>
                      <td>{mach.debitFee}%</td>
                      <td>{mach.credit1xFee}%</td>
                      <td>{mach.credit2to6Fee}%</td>
                      <td>{mach.credit7to12Fee}%</td>
                      <td>D+{mach.settlementDays}</td>
                      <td>{mach.primary ? <span className="status-badge green">Principal</span> : <span style={{ color: "#aaa" }}>-</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button type="button" className="table-action-btn" onClick={() => openMachineModal(mach)}>Editar</button>
                          <button type="button" className="table-action-btn delete" onClick={() => handleDeleteMachine(mach.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: PARCEIROS E FROTAS */}
      {activeTab === "partners" && (
        <div className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Parceiros Comerciais e Frotas</h2>
              <p>Empresas conveniadas e parceiros com desconto e fechamento quinzenal ou mensal</p>
            </div>
            <button type="button" className="primary-button" onClick={() => openPartnerModal()}>
              + Novo Parceiro
            </button>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Empresa / Parceiro</th>
                  <th>Telefone / Contato</th>
                  <th>Desconto Mão de Obra</th>
                  <th>Ciclo de Cobrança</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {partners.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty-state">
                        <strong>Nenhum parceiro cadastrado</strong>
                        <p>Cadastre frotas e empresas com condições de faturamento diferenciadas.</p>
                        <button type="button" className="outline-button" onClick={() => openPartnerModal()}>
                          + Cadastrar Parceiro
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  partners.map((part) => (
                    <tr key={part.id}>
                      <td><strong>{part.name}</strong></td>
                      <td>{part.phone || "-"}</td>
                      <td><strong style={{ color: "var(--green)" }}>-{part.laborDiscount}%</strong></td>
                      <td><span className="tag-badge amber">{part.billingCycle}</span></td>
                      <td>{part.active !== false ? <span className="status-badge green">Ativo</span> : <span className="status-badge red">Inativo</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: "6px" }}>
                          <button type="button" className="table-action-btn" onClick={() => openPartnerModal(part)}>Editar</button>
                          <button type="button" className="table-action-btn delete" onClick={() => handleDeletePartner(part.id)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: ESTOQUE E REPOSIÇÃO */}
      {activeTab === "stock" && (
        <form onSubmit={handleSaveGeneral} className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Regras de Estoque e Margem Padrão</h2>
              <p>Controle automático de movimentações, avisos de reposição e precificação</p>
            </div>
            <button type="submit" className="primary-button" disabled={isSavingGeneral}>
              {isSavingGeneral ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>

          <div className="settings-card-body">
            <div className="settings-grid-3">
              <label className="settings-field">
                <span className="settings-field-label">Estoque Mínimo Padrão</span>
                <input
                  type="number"
                  min="0"
                  value={generalSettings.defaultMinStock}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultMinStock: parseInt(e.target.value, 10) || 2 })}
                  className="settings-input bold-val"
                />
                <span className="settings-hint">Quantidade mínima para disparo de alerta de reposição</span>
              </label>

              <label className="settings-field">
                <span className="settings-field-label">Margem de Lucro Sugerida (%)</span>
                <input
                  type="number"
                  min="0"
                  value={generalSettings.suggestedMarkup}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, suggestedMarkup: parseInt(e.target.value, 10) || 45 })}
                  className="settings-input bold-val"
                />
                <span className="settings-hint">Aplicada automaticamente sobre o custo de novos produtos</span>
              </label>

              <label className="settings-field">
                <span className="settings-field-label">Unidade de Medida Padrão</span>
                <select
                  value={generalSettings.defaultUnit}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, defaultUnit: e.target.value })}
                  className="settings-select"
                >
                  {/* A lista vem da aba "Listas do sistema". Antes esta lista e a do
                      cadastro de produto eram fixas e diferentes entre si (JG/MT aqui,
                      JOGO/KG/M lá), então a unidade padrão escolhida aqui podia nem
                      existir como opção na hora de cadastrar a peça. */}
                  {lists.units.map((unit) => <option value={unit} key={unit}>{unit}</option>)}
                </select>
                <span className="settings-hint">Unidade pré-selecionada no cadastro de peças. Edite a lista em "Listas do sistema".</span>
              </label>
            </div>

            <div className="settings-grid-2">
              <div className="settings-toggle-box">
                <div>
                  <strong>Bloquear venda no PDV caso o estoque esteja zerado</strong>
                  <span>Impede finalizar venda no balcão sem saldo prévio registrado</span>
                </div>
                <label className="switch-toggle-btn">
                  <input
                    type="checkbox"
                    checked={generalSettings.blockZeroStockSale}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, blockZeroStockSale: e.target.checked })}
                  />
                  <span className="switch-toggle-slider"></span>
                </label>
              </div>

              <div className="settings-toggle-box">
                <div>
                  <strong>Baixar peça do estoque somente quando a OS for iniciada</strong>
                  <span>Evita retirar do estoque físico durante fase de orçamento</span>
                </div>
                <label className="switch-toggle-btn">
                  <input
                    type="checkbox"
                    checked={generalSettings.deductStockOnlyWhenUsed}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, deductStockOnlyWhenUsed: e.target.checked })}
                  />
                  <span className="switch-toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 7: IMPRESSÃO & WHATSAPP */}
      {activeTab === "print" && (
        <form onSubmit={handleSaveGeneral} className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Impressão de Comprovantes & Mensagens no WhatsApp</h2>
              <p>Modelos de texto automáticos e configuração de impressão térmica</p>
            </div>
            <button type="submit" className="primary-button" disabled={isSavingGeneral}>
              {isSavingGeneral ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>

          <div className="settings-card-body">
            <div className="settings-grid-3">
              <label className="settings-field">
                <span className="settings-field-label">Modelo da Impressora Térmica</span>
                <input
                  type="text"
                  value={generalSettings.thermalPrinter}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, thermalPrinter: e.target.value })}
                  className="settings-input"
                  placeholder="Ex: Elgin i9 / Bematech MP-4200"
                />
              </label>

              <label className="settings-field">
                <span className="settings-field-label">Formato Padrão de Impressão</span>
                <select
                  value={generalSettings.printFormat}
                  onChange={(e) => setGeneralSettings({ ...generalSettings, printFormat: e.target.value })}
                  className="settings-select"
                >
                  <option value="Cupom 80mm">Cupom Térmico 80mm (Padrão)</option>
                  <option value="Cupom 58mm">Cupom Térmico 58mm (Estreito)</option>
                  <option value="Folha A4">Folha A4 (Ofício)</option>
                </select>
              </label>

              <div className="settings-toggle-box" style={{ alignSelf: "end" }}>
                <div>
                  <strong>Impressão em 3 vias</strong>
                  <span>Via Mecânico, Caixa e Cliente</span>
                </div>
                <label className="switch-toggle-btn">
                  <input
                    type="checkbox"
                    checked={generalSettings.printThreeCopies}
                    onChange={(e) => setGeneralSettings({ ...generalSettings, printThreeCopies: e.target.checked })}
                  />
                  <span className="switch-toggle-slider"></span>
                </label>
              </div>
            </div>

            <label className="settings-field">
              <span className="settings-field-label">Mensagem Padrão de WhatsApp (Orçamento Pronto)</span>
              <textarea
                rows={4}
                value={generalSettings.defaultWhatsappMessage}
                onChange={(e) => setGeneralSettings({ ...generalSettings, defaultWhatsappMessage: e.target.value })}
                className="settings-textarea"
                placeholder="Olá {cliente}! Seu orçamento da moto {moto} está pronto..."
              />
              <span className="settings-hint">Tags automáticas disponíveis: <code>{"{cliente}"}</code>, <code>{"{moto}"}</code>, <code>{"{placa}"}</code>, <code>{"{total}"}</code>, <code>{"{os}"}</code></span>
            </label>
          </div>
        </form>
      )}

      {/* QUICK SERVICE MODAL */}
      {isQuickServiceModalOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsQuickServiceModalOpen(false); }}>
          <section className="dialog" style={{ maxWidth: "560px" }} role="dialog" aria-modal="true">
            <header className="dialog-header">
              <div>
                <span>Serviços Rápidos</span>
                <h2>{editingQuickService ? "Editar Serviço Rápido" : "Novo Serviço Rápido"}</h2>
                <p>Configure a mão de obra expressa e o produto obrigatório</p>
              </div>
              <button aria-label="Fechar" onClick={() => setIsQuickServiceModalOpen(false)}>×</button>
            </header>
            <form onSubmit={handleSaveQuickService}>
              <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="settings-field">
                  <span className="settings-field-label">Nome do Serviço <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={qsName}
                    onChange={(e) => setQsName(e.target.value)}
                    placeholder="Ex: Troca de Óleo Yamalube 4T"
                    className="settings-input"
                    autoFocus
                  />
                </label>

                <div className="settings-grid-2">
                  <label className="settings-field">
                    <span className="settings-field-label">Preço da Mão de Obra (R$) <b className="req">*</b></span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={qsLabor}
                      onChange={(e) => setQsLabor(parseFloat(e.target.value) || 0)}
                      className="settings-input bold-val"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-field-label">Duração Estimada (Minutos)</span>
                    <input
                      type="number"
                      min="1"
                      value={qsDuration}
                      onChange={(e) => setQsDuration(parseInt(e.target.value, 10) || 15)}
                      className="settings-input"
                    />
                  </label>
                </div>

                <label className="settings-field">
                  <span className="settings-field-label">Linha / Categoria de Peça Requerida</span>
                  <input
                    type="text"
                    value={qsCategory}
                    onChange={(e) => setQsCategory(e.target.value)}
                    placeholder="Ex: Lubrificantes e Fluidos / Freios e Rodas"
                    className="settings-input"
                  />
                </label>

                <div className="settings-toggle-box">
                  <div>
                    <strong>Exigir seleção de produto no balcão</strong>
                    <span>Obrigatório adicionar o item físico de estoque (ex: 1L óleo)</span>
                  </div>
                  <label className="switch-toggle-btn">
                    <input
                      type="checkbox"
                      checked={qsRequired}
                      onChange={(e) => setQsRequired(e.target.checked)}
                    />
                    <span className="switch-toggle-slider"></span>
                  </label>
                </div>

                <div className="settings-toggle-box">
                  <div>
                    <strong>Serviço Ativo</strong>
                    <span>Disponível no menu de Serviço Rápido</span>
                  </div>
                  <label className="switch-toggle-btn">
                    <input
                      type="checkbox"
                      checked={qsActive}
                      onChange={(e) => setQsActive(e.target.checked)}
                    />
                    <span className="switch-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <footer className="dialog-footer">
                <button type="button" className="ghost-button" onClick={() => setIsQuickServiceModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Salvar Serviço
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* CATEGORY MODAL */}
      {isCategoryModalOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsCategoryModalOpen(false); }}>
          <section className="dialog" style={{ maxWidth: "500px" }} role="dialog" aria-modal="true">
            <header className="dialog-header">
              <div>
                <span>Categorias</span>
                <h2>{editingCategory ? "Editar Categoria" : "Nova Categoria"}</h2>
                <p>Categorize itens para relatórios e pesquisas rápidas</p>
              </div>
              <button aria-label="Fechar" onClick={() => setIsCategoryModalOpen(false)}>×</button>
            </header>
            <form onSubmit={handleSaveCategory}>
              <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="settings-field">
                  <span className="settings-field-label">Nome da Categoria <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="Ex: Relação e Correntes"
                    className="settings-input"
                    autoFocus
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-field-label">Módulo / Grupo</span>
                  <select
                    value={catGroup}
                    onChange={(e) => setCatGroup(e.target.value as "Serviços" | "Produtos" | "Despesas")}
                    className="settings-select"
                  >
                    <option value="Produtos">Produtos (Estoque)</option>
                    <option value="Serviços">Serviços (Oficina)</option>
                    <option value="Despesas">Despesas (Financeiro)</option>
                  </select>
                </label>

                <div className="settings-toggle-box">
                  <div>
                    <strong>Categoria Ativa</strong>
                    <span>Disponível para seleção nos cadastros</span>
                  </div>
                  <label className="switch-toggle-btn">
                    <input
                      type="checkbox"
                      checked={catActive}
                      onChange={(e) => setCatActive(e.target.checked)}
                    />
                    <span className="switch-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <footer className="dialog-footer">
                <button type="button" className="ghost-button" onClick={() => setIsCategoryModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Salvar Categoria
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* PAYMENT MACHINE MODAL */}
      {isMachineModalOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsMachineModalOpen(false); }}>
          <section className="dialog" style={{ maxWidth: "560px" }} role="dialog" aria-modal="true">
            <header className="dialog-header">
              <div>
                <span>Pagamentos & Taxas</span>
                <h2>{editingMachine ? "Editar Maquininha" : "Nova Maquininha"}</h2>
                <p>Taxas de intermediação e repasse de operadora</p>
              </div>
              <button aria-label="Fechar" onClick={() => setIsMachineModalOpen(false)}>×</button>
            </header>
            <form onSubmit={handleSaveMachine}>
              <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="settings-field">
                  <span className="settings-field-label">Nome / Identificação da Maquininha <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={machName}
                    onChange={(e) => setMachName(e.target.value)}
                    placeholder="Ex: Stone Balcão / PagBank / Mercado Pago"
                    className="settings-input"
                    autoFocus
                  />
                </label>

                <div className="settings-grid-2">
                  <label className="settings-field">
                    <span className="settings-field-label">Taxa Débito (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={machDebit}
                      onChange={(e) => setMachDebit(parseFloat(e.target.value) || 0)}
                      className="settings-input bold-val"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-field-label">Taxa Crédito 1x (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={machCred1}
                      onChange={(e) => setMachCred1(parseFloat(e.target.value) || 0)}
                      className="settings-input bold-val"
                    />
                  </label>
                </div>

                <div className="settings-grid-2">
                  <label className="settings-field">
                    <span className="settings-field-label">Crédito 2x a 6x (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={machCred2}
                      onChange={(e) => setMachCred2(parseFloat(e.target.value) || 0)}
                      className="settings-input"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-field-label">Crédito 7x a 12x (%)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={machCred7}
                      onChange={(e) => setMachCred7(parseFloat(e.target.value) || 0)}
                      className="settings-input"
                    />
                  </label>
                </div>

                <label className="settings-field">
                  <span className="settings-field-label">Prazo de Liquidação / Repasse (Dias)</span>
                  <input
                    type="number"
                    min="0"
                    value={machDays}
                    onChange={(e) => setMachDays(parseInt(e.target.value, 10) || 1)}
                    className="settings-input"
                  />
                </label>

                <div className="settings-toggle-box">
                  <div>
                    <strong>Maquininha Principal da Oficina</strong>
                    <span>Selecionada por padrão nas vendas com cartão</span>
                  </div>
                  <label className="switch-toggle-btn">
                    <input
                      type="checkbox"
                      checked={machPrimary}
                      onChange={(e) => setMachPrimary(e.target.checked)}
                    />
                    <span className="switch-toggle-slider"></span>
                  </label>
                </div>
              </div>

              <footer className="dialog-footer">
                <button type="button" className="ghost-button" onClick={() => setIsMachineModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Salvar Maquininha
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* PARTNER MODAL */}
      {isPartnerModalOpen && (
        <div className="dialog-layer" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setIsPartnerModalOpen(false); }}>
          <section className="dialog" style={{ maxWidth: "540px" }} role="dialog" aria-modal="true">
            <header className="dialog-header">
              <div>
                <span>Parceiros & Frotas</span>
                <h2>{editingPartner ? "Editar Parceiro" : "Novo Parceiro / Frota"}</h2>
                <p>Condições especiais de faturamento e desconto em mão de obra</p>
              </div>
              <button aria-label="Fechar" onClick={() => setIsPartnerModalOpen(false)}>×</button>
            </header>
            <form onSubmit={handleSavePartner}>
              <div className="dialog-body" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <label className="settings-field">
                  <span className="settings-field-label">Nome da Empresa / Frota <b className="req">*</b></span>
                  <input
                    type="text"
                    required
                    value={partName}
                    onChange={(e) => setPartName(e.target.value)}
                    placeholder="Ex: Flash Entregas Rápidas"
                    className="settings-input"
                    autoFocus
                  />
                </label>

                <div className="settings-grid-2">
                  <label className="settings-field">
                    <span className="settings-field-label">Telefone / WhatsApp</span>
                    <input
                      type="text"
                      value={partPhone}
                      onChange={(e) => setPartPhone(e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="settings-input"
                    />
                  </label>
                  <label className="settings-field">
                    <span className="settings-field-label">Desconto em Mão de Obra (%)</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={partDiscount}
                      onChange={(e) => setPartDiscount(parseFloat(e.target.value) || 0)}
                      className="settings-input bold-val"
                    />
                  </label>
                </div>

                <label className="settings-field">
                  <span className="settings-field-label">Ciclo de Faturamento / Pagamento</span>
                  <input
                    type="text"
                    value={partCycle}
                    onChange={(e) => setPartCycle(e.target.value)}
                    placeholder="Ex: Quinzenal (Dias 15 e 30)"
                    className="settings-input"
                  />
                </label>
              </div>

              <footer className="dialog-footer">
                <button type="button" className="ghost-button" onClick={() => setIsPartnerModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button">
                  Salvar Parceiro
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {/* TAB 8: LISTAS DO SISTEMA */}
      {activeTab === "lists" && (
        <form onSubmit={handleSaveLists} className="settings-card">
          <div className="settings-card-header">
            <div>
              <h2>Listas do Sistema</h2>
              <p>As opções que aparecem nos campos de escolha do sistema inteiro</p>
            </div>
            <button type="submit" className="primary-button" disabled={isSavingLists}>
              {isSavingLists ? "Salvando..." : "Salvar Alterações"}
            </button>
          </div>

          <div className="settings-card-body">
            <div className="settings-list-grid">
              {(Object.keys(defaultSystemLists) as (keyof SystemLists)[]).map((key) => (
                <section className="settings-list-block" key={key}>
                  <div className="settings-list-head">
                    <strong>{systemListLabels[key].title}</strong>
                    <small>{systemListLabels[key].hint}</small>
                  </div>
                  <div className="settings-chips">
                    {lists[key].map((item) => (
                      <span className="settings-chip" key={item}>
                        {item}
                        <button
                          type="button"
                          onClick={() => removeListItem(key, item)}
                          aria-label={`Remover ${item}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="settings-chip-add">
                    <input
                      value={newListItem[key] ?? ""}
                      onChange={(e) => setNewListItem({ ...newListItem, [key]: e.target.value })}
                      onKeyDown={(e) => {
                        // Enter adiciona o item em vez de enviar o formulário
                        // inteiro, que salvaria sem o que acabou de ser digitado.
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addListItem(key);
                        }
                      }}
                      placeholder={systemListLabels[key].placeholder}
                      className="dialog-input"
                    />
                    <button type="button" className="outline-button" onClick={() => addListItem(key)}>
                      Adicionar
                    </button>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
