import React, { useState, useEffect, useRef } from "react";
import type { ClientRecord, MotorcycleRecord, PartnerConfig } from "../types";
import { emMaiusculo } from "../text-case";
import { QuickAddSelect } from "./QuickAddSelect";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { defaultSystemLists } from "../types";
import { BikeModelFields } from "./BikeModelFields";
import { motorcycleIdFor } from "../plate";
import { RemovalButton, type RemovalConfig } from "./RemovalButton";

interface MotorcycleFormModalProps {
  /** Excluir o cadastro pelo próprio formulário. Ausente = só criar e editar. */
  removal?: RemovalConfig;
  isOpen: boolean;
  onClose: () => void;
  onSaved: (motorcycle: MotorcycleRecord) => void;
  editingMotorcycle?: MotorcycleRecord | null;
  clients: ClientRecord[];
  notify: (msg: string) => void;
  allMotorcycles: MotorcycleRecord[];
  preselectedClientId?: string;
  /** Marcas configuradas em Configurações → Listas do sistema. */
  brands?: string[];
  /** Criar marca de moto sem sair do cadastro. */
  onCreateBrand?: (nome: string) => Promise<void> | void;
  /** Empresas parceiras, para marcar a responsável por uma moto de frota. */
  partners?: PartnerConfig[];
  preselectedPartnerId?: string;
}

export const MotorcycleFormModal: React.FC<MotorcycleFormModalProps> = ({
  removal,
  isOpen,
  onClose,
  onSaved,
  editingMotorcycle,
  clients,
  notify,
  allMotorcycles,
  preselectedClientId,
  brands = [],
  onCreateBrand,
  partners = [],
  preselectedPartnerId,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const formularioRef = useRef<HTMLFormElement>(null);
  // O que falta preencher, dito DENTRO do formulário.
  //
  // Era um `notify` — o aviso de canto da aplicação —, que num formulário
  // aberto por cima de outro (o cadastro de cliente chamado de dentro da OS)
  // aparece atrás do modal. Quem clicava em salvar via a aba trocar sozinha e
  // nada acontecer, sem nenhuma explicação na tela.
  const [erroForm, setErroForm] = useState("");

  // Form Fields
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("Honda");
  const [model, setModel] = useState("");
  // O modelo é gravado como um texto só ("CG 160 Fan") — é o que a OS imprime
  // e o que a busca procura. Qual modelo e qual versão estão escolhidos é
  // derivado desse texto dentro de BikeModelFields, e não copiado para cá:
  // cópia é o que faz a tela mostrar uma coisa e o banco guardar outra.
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [mileage, setMileage] = useState<number | "">("");
  const [engineSize, setEngineSize] = useState("");
  const [chassis, setChassis] = useState("");
  const [renavam, setRenavam] = useState("");
  const [notes, setNotes] = useState("");

  // Marcas vindas de Configurações → Listas do sistema, com a lista de fábrica
  // como padrão enquanto a oficina não ajustar a dela.
  const brandOptions = brands.length ? brands : defaultSystemLists.motorcycleBrands;

  const colorOptions = [
    "Preta",
    "Vermelha",
    "Azul",
    "Prata",
    "Cinza",
    "Branca",
    "Amarela",
    "Verde",
    "Laranja",
    "Outra",
  ];

  useEffect(() => {
    if (!isOpen) return;

    if (editingMotorcycle) {
      setPlate(editingMotorcycle.plate || "");
      setBrand(editingMotorcycle.brand || "Honda");
      setModel(editingMotorcycle.model || "");
      setYear(editingMotorcycle.year || "");
      setColor(editingMotorcycle.color || "");
      setOwnerId(editingMotorcycle.ownerId || "");
      setPartnerId(editingMotorcycle.partnerId || "");
      setMileage(editingMotorcycle.mileage ?? "");
      setEngineSize(editingMotorcycle.engineSize || "");
      setChassis(editingMotorcycle.chassis || "");
      setRenavam(editingMotorcycle.renavam || "");
      setNotes(editingMotorcycle.notes || "");
    } else {
      setPlate("");
      setBrand("Honda");
      setModel("");
      setYear(`${new Date().getFullYear()}`);
      setColor("Preta");
      // Sem o `|| clients[0]`: não escolher dono não pode significar "o primeiro
      // cliente da agenda". A moto ficava no nome de alguém que nunca foi dono
      // dela e passava a aparecer na lista de motos daquela pessoa na OS.
      setOwnerId(preselectedClientId || "");
      setPartnerId(preselectedPartnerId || "");
      setMileage("");
      setEngineSize("160");
      setChassis("");
      setRenavam("");
      setNotes("");
    }
  }, [isOpen, editingMotorcycle, preselectedClientId, preselectedPartnerId, clients]);

  const normalizePlateInput = (val: string) => {
    return val.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  };

  const formattedPlateDisplay = (val: string) => {
    const norm = normalizePlateInput(val);
    if (norm.length > 3) {
      return `${norm.slice(0, 3)}-${norm.slice(3)}`;
    }
    return norm;
  };

  const plateTypeIndicator = (val: string) => {
    const norm = normalizePlateInput(val);
    if (norm.length < 7) return null;
    return /[A-Z]/.test(norm[4]) ? "Mercosul" : "Antigo";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPlate = normalizePlateInput(plate);
    if (!cleanPlate) {
      setErroForm("Informe a placa da motocicleta.");
      return;
    }

    if (!model.trim()) {
      setErroForm("Informe o modelo da moto.");
      return;
    }

    setErroForm("");
    setIsSaving(true);
    try {
      const motoId = editingMotorcycle?.id || motorcycleIdFor(cleanPlate);
      const ownerObj = clients.find((c) => c.id === ownerId);

      const motorcycleData: MotorcycleRecord = {
        id: motoId,
        ownerId,
        ownerName: ownerObj ? ownerObj.name : "",
        partnerId,
        partnerName: partners.find((item) => item.id === partnerId)?.name ?? "",
        plate: formattedPlateDisplay(cleanPlate),
        brand,
        model: model.trim(),
        year: year.trim(),
        color: color.trim(),
        mileage: typeof mileage === "number" ? mileage : undefined,
        engineSize: engineSize.trim(),
        chassis: chassis.trim(),
        renavam: renavam.trim(),
        notes: notes.trim(),
      };

      await saveFirestoreDoc("motorcycles", motoId, {
        ownerId: motorcycleData.ownerId,
        ownerName: motorcycleData.ownerName,
        partnerId: motorcycleData.partnerId,
        partnerName: motorcycleData.partnerName,
        plate: motorcycleData.plate,
        brand: motorcycleData.brand,
        model: motorcycleData.model,
        year: motorcycleData.year,
        color: motorcycleData.color,
        mileage: motorcycleData.mileage || 0,
        engineSize: motorcycleData.engineSize,
        chassis: motorcycleData.chassis,
        renavam: motorcycleData.renavam,
        notes: motorcycleData.notes,
      });

      // Update owner's motorcycleIds list if owner exists
      if (ownerId && ownerObj) {
        const existingMotos = new Set(ownerObj.motorcycleIds || []);
        existingMotos.add(motoId);
        await saveFirestoreDoc("clients", ownerId, {
          motorcycleIds: Array.from(existingMotos),
        });
      }

      onSaved(motorcycleData);
      notify(editingMotorcycle ? "Motocicleta atualizada com sucesso!" : "Motocicleta cadastrada com sucesso!");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao salvar moto:", err);
      setErroForm(err instanceof Error ? err.message : "Não foi possível salvar a motocicleta. Verifique a conexão e tente de novo.");
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * F5 grava e Esc fecha, como no sistema que a oficina já usa e como no
   * cadastro de peça. O atalho é ligado só enquanto este formulário está
   * aberto: fechou, F5 volta a recarregar a página.
   */
  useEffect(() => {
    if (!isOpen) return;
    const noTeclado = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); onClose(); return; }
      if (evento.key !== "F5") return;
      evento.preventDefault();
      formularioRef.current?.requestSubmit();
    };
    window.addEventListener("keydown", noTeclado);
    return () => window.removeEventListener("keydown", noTeclado);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window" style={{ maxWidth: "680px" }}>
        <div className="dialog-head pdv-head">
          <div>
            <strong>{editingMotorcycle ? "Editar Motocicleta" : "Cadastrar Motocicleta"}</strong>
            <span>{editingMotorcycle ? `Placa: ${editingMotorcycle.plate} · ${editingMotorcycle.model}` : "Cadastro rápido para atendimento no balcão e oficina"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        {/*
            noValidate: a conferência é nossa, não a do navegador.

            Enquanto o cadastro tinha etapas, o campo obrigatório da etapa
            seguinte nem estava na tela, então o `required` do HTML nunca
            barrava nada. Numa tela só ele barra — e o balão do navegador
            entra na frente da mensagem escrita DENTRO do formulário, que é
            justamente a que diz o que a oficina precisa ("toda pessoa
            cadastrada precisa de pelo menos uma moto vinculada").
          */}
          <form noValidate ref={formularioRef} onSubmit={handleSubmit} className="dialog-body">
          {erroForm ? <div className="settings-modal-error" role="alert"><b>!</b><span>{erroForm}</span></div> : null}
          {/* Mesma régua do cadastro de peça: rótulo à esquerda do campo. */}
          <div className="pdv-form">
          <div className="form-section-stack">
            {/* Linha 1: Placa e Proprietário */}
            <div className="form-grid-2">
              <label className="field-group">
                <span className="field-label" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Placa da Moto <b className="req">*</b></span>
                  {plateTypeIndicator(plate) && (
                    <span className="plate-badge-indicator">{plateTypeIndicator(plate)}</span>
                  )}
                </span>
                <input
                  type="text"
                  required
                  maxLength={8}
                  value={plate}
                  onChange={(e) => setPlate(emMaiusculo(emMaiusculo(e.target.value)))}
                  placeholder="ABC-1234 ou ABC1D23"
                  className="dialog-input bold-number"
                  style={{ textTransform: "uppercase", letterSpacing: "1px" }}
                  autoFocus
                />
              </label>

              <label className="field-group">
                <span className="field-label">Proprietário</span>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="dialog-select"
                >
                  <option value="">-- Sem dono individual --</option>
                  {clients.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.name} {cli.phone ? `(${cli.phone})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/*
              Moto de frota não tem dono individual: a oficina atende a moto do
              aplicativo de entrega sem nunca saber quem é o motoboy da vez.
              Quem responde é a empresa parceira, e é por ela que essas motos
              são encontradas na hora de abrir a OS.
            */}
            {partners.length > 0 ? (
              <label className="field-group">
                <span className="field-label">Parceira responsável</span>
                <select
                  value={partnerId}
                  onChange={(e) => setPartnerId(e.target.value)}
                  className="dialog-select"
                >
                  <option value="">-- Nenhuma: é moto de cliente --</option>
                  {partners.map((parceira) => (
                    <option key={parceira.id} value={parceira.id}>{parceira.name}</option>
                  ))}
                </select>
                <span className="settings-hint">
                  {partnerId
                    ? "Esta moto aparece na lista da parceira ao abrir uma OS, mesmo sem dono cadastrado."
                    : "Use quando a moto é da frota de uma empresa e não tem dono individual."}
                </span>
              </label>
            ) : null}

            {/* Linha 2: Marca, Modelo e Versão.
                A mesma peça que a OS usa (src/components/BikeModelFields.tsx):
                duas cópias do catálogo divergiriam, e aí a moto cadastrada
                aqui e a moto escrita na OS deixariam de ser a mesma moto. */}
            <div className="form-grid-3">
              <BikeModelFields
                brand={brand}
                model={model}
                onChange={(valor) => { setBrand(valor.brand); setModel(valor.model); }}
                brandOptions={brandOptions}
                onCreateBrand={onCreateBrand}
              />
            </div>

            {/* Linha 3: Ano, Cor, KM e Cilindrada */}
            <div className="form-grid-4">
              <label className="field-group">
                <span className="field-label">Ano fab./mod.</span>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(emMaiusculo(e.target.value))}
                  placeholder="Ex: 2023"
                  className="dialog-input"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Cor</span>
                <select
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="dialog-select"
                >
                  {colorOptions.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label className="field-group">
                <span className="field-label">KM Atual</span>
                <input
                  type="number"
                  min="0"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value ? parseInt(e.target.value, 10) : "")}
                  placeholder="Ex: 24500"
                  className="dialog-input"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Cilindrada (cc)</span>
                <input
                  type="text"
                  value={engineSize}
                  onChange={(e) => setEngineSize(emMaiusculo(e.target.value))}
                  placeholder="160"
                  className="dialog-input"
                />
              </label>
            </div>

            {/* Linha 4: Chassi e RENAVAM */}
            <div className="form-grid-2">
              <label className="field-group">
                <span className="field-label">Chassi</span>
                <input
                  type="text"
                  value={chassis}
                  onChange={(e) => setChassis(emMaiusculo(emMaiusculo(e.target.value)))}
                  placeholder="9C2..."
                  className="dialog-input"
                />
              </label>

              <label className="field-group">
                <span className="field-label">RENAVAM</span>
                <input
                  type="text"
                  value={renavam}
                  onChange={(e) => setRenavam(emMaiusculo(e.target.value))}
                  placeholder="00123456789"
                  className="dialog-input"
                />
              </label>
            </div>

            {/* Linha 5: Observações */}
            <label className="field-group">
              <span className="field-label">Observações</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Retrovisor direito trincado, tanque com leve arranhão no lado esquerdo."
                className="dialog-textarea"
              />
            </label>
          </div>
          </div>

          <div className="dialog-actions-row">
            <div>
              <button type="button" className="outline-button pdv-footer-button" onClick={onClose} disabled={isSaving}>
                <kbd>Esc</kbd>
                Cancelar
              </button>
              {editingMotorcycle && removal ? <RemovalButton tipo="moto" colecao="motorcycles" id={editingMotorcycle.id} nome={editingMotorcycle.plate} {...removal}/> : null}
            </div>
            <button type="submit" className="primary-button save-action-btn pdv-footer-button" disabled={isSaving}>
                <kbd>F5</kbd>
              {isSaving ? "Salvando no Firestore..." : (editingMotorcycle ? "Salvar Alterações" : "Cadastrar Motocicleta")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
