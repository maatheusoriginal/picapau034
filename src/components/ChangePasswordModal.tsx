import React, { useState } from "react";
import type { FirebaseManagedUser } from "../../app/firebase/client";
import { setManagedUserPassword, firebaseErrorMessage } from "../../app/firebase/client";

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: FirebaseManagedUser | null;
  notify: (msg: string) => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  user,
  notify,
}) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  if (!isOpen || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (password.length < 6) {
      setErrorMessage("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("As senhas informadas não coincidem.");
      return;
    }

    setIsSaving(true);
    try {
      await setManagedUserPassword(user.uid, user.email, password);
      notify(`Senha de ${user.name} alterada com sucesso!`);
      setPassword("");
      setConfirmPassword("");
      onClose();
    } catch (err: unknown) {
      console.error("Erro ao alterar senha:", err);
      const msg = firebaseErrorMessage(err);
      setErrorMessage(msg);
      notify(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog-window" style={{ maxWidth: "480px" }}>
        <div className="dialog-head">
          <div>
            <strong>Alterar Senha de Acesso</strong>
            <span>{user.name} · {user.email || user.role}</span>
          </div>
          <button className="icon-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="dialog-body">
          <div className="form-section-stack">
            {errorMessage && (
              <div className="alert-card" style={{ background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.2)", color: "#b91c1c", padding: "12px 16px" }}>
                <strong>{errorMessage}</strong>
              </div>
            )}

            <label className="field-group">
              <span className="field-label">Nova Senha <b className="req">*</b></span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="dialog-input"
                autoFocus
              />
            </label>

            <label className="field-group">
              <span className="field-label">Confirmar Nova Senha <b className="req">*</b></span>
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repita a nova senha"
                className="dialog-input"
              />
            </label>
          </div>

          <div className="dialog-actions-row">
            <button type="button" className="outline-button" onClick={onClose} disabled={isSaving}>
              Cancelar
            </button>
            <button type="submit" className="primary-button save-action-btn" disabled={isSaving}>
              {isSaving ? "Atualizando Senha..." : "Salvar Nova Senha"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
