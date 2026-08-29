import React, { useState, useEffect } from "react";
import type { ClientRecord, MotorcycleRecord } from "../types";
import { saveFirestoreDoc } from "../../app/firebase/client";
import { defaultSystemLists } from "../types";

interface MotorcycleFormModalProps {
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
}

export const MotorcycleFormModal: React.FC<MotorcycleFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  editingMotorcycle,
  clients,
  notify,
  allMotorcycles,
  preselectedClientId,
  brands = [],
}) => {
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("Honda");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [ownerId, setOwnerId] = useState("");
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
      setOwnerId(preselectedClientId || (clients[0] ? clients[0].id : ""));
      setMileage("");
      setEngineSize("160");
      setChassis("");
      setRenavam("");
      setNotes("");
    }
  }, [isOpen, editingMotorcycle, preselectedClientId, clients]);

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
      notify("Informe a placa da motocicleta.");
      return;
    }

    if (!model.trim()) {
      notify("Informe o modelo da moto.");
      return;
    }

    setIsSaving(true);
    try {
      const motoId = editingMotorcycle?.id || `MOTO-${cleanPlate}`;
      const ownerObj = clients.find((c) => c.id === ownerId);

      const motorcycleData: MotorcycleRecord = {
        id: motoId,
        ownerId,
        ownerName: ownerObj ? ownerObj.name : "",
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
      notify(err instanceof Error ? err.message : "Não foi possível salvar a motocicleta.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window" style={{ maxWidth: "680px" }}>
        <div className="dialog-head">
          <div>
            <strong>{editingMotorcycle ? "Editar Motocicleta" : "Cadastrar Motocicleta"}</strong>
            <span>{editingMotorcycle ? `Placa: ${editingMotorcycle.plate} · ${editingMotorcycle.model}` : "Cadastro rápido para atendimento no balcão e oficina"}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar modal">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
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
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  placeholder="ABC-1234 ou ABC1D23"
                  className="dialog-input bold-number"
                  style={{ textTransform: "uppercase", letterSpacing: "1px" }}
                  autoFocus
                />
              </label>

              <label className="field-group">
                <span className="field-label">Cliente / Proprietário</span>
                <select
                  value={ownerId}
                  onChange={(e) => setOwnerId(e.target.value)}
                  className="dialog-select"
                >
                  <option value="">-- Selecione o cliente proprietário --</option>
                  {clients.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.name} {cli.phone ? `(${cli.phone})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Linha 2: Marca, Modelo e Versão */}
            <div className="form-grid-3">
              <label className="field-group">
                <span className="field-label">Marca / Fabricante <b className="req">*</b></span>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  className="dialog-select"
                >
                  {brandOptions.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>

              <label className="field-group" style={{ gridColumn: "span 2" }}>
                <span className="field-label">Modelo e Versão <b className="req">*</b></span>
                <input
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Ex: CG 160 Fan ESDI / Fazer 250 ABS"
                  className="dialog-input"
                />
              </label>
            </div>

            {/* Linha 3: Ano, Cor, KM e Cilindrada */}
            <div className="form-grid-4">
              <label className="field-group">
                <span className="field-label">Ano Fab./Mod.</span>
                <input
                  type="text"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
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
                  onChange={(e) => setEngineSize(e.target.value)}
                  placeholder="160"
                  className="dialog-input"
                />
              </label>
            </div>

            {/* Linha 4: Chassi e RENAVAM */}
            <div className="form-grid-2">
              <label className="field-group">
                <span className="field-label">Número do Chassi</span>
                <input
                  type="text"
                  value={chassis}
                  onChange={(e) => setChassis(e.target.value.toUpperCase())}
                  placeholder="9C2..."
                  className="dialog-input"
                />
              </label>

              <label className="field-group">
                <span className="field-label">Código RENAVAM</span>
                <input
                  type="text"
                  value={renavam}
                  onChange={(e) => setRenavam(e.target.value)}
                  placeholder="00123456789"
                  className="dialog-input"
                />
              </label>
            </div>

            {/* Linha 5: Observações */}
            <label className="field-group">
              <span className="field-label">Observações e Avarias Prévias</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Retrovisor direito trincado, tanque com leve arranhão no lado esquerdo."
                className="dialog-textarea"
              />
            </label>
          </div>

          <div className="dialog-actions-row">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
              {isSaving ? "Salvando no Firestore..." : (editingMotorcycle ? "Salvar Alterações" : "Cadastrar Motocicleta")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
