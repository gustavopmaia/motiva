import { useEffect, useState } from "react";
import { Camera, X } from "lucide-react";
import styles from "./index.module.css";

export type CompleteWorkOrderPayload = {
  photo: File;
  lat: number;
  lon: number;
  capturedAt: string;
};

interface CompleteWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CompleteWorkOrderPayload) => Promise<void>;
}

export function CompleteWorkOrderModal({ isOpen, onClose, onSubmit }: CompleteWorkOrderModalProps) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [lat, setLat] = useState<string>("");
  const [lon, setLon] = useState<string>("");
  const [geoDenied, setGeoDenied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setPhoto(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setLat("");
    setLon("");
    setGeoDenied(false);
    setError(null);

    if (!navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLon(String(position.coords.longitude));
      },
      () => setGeoDenied(true),
    );
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setError(null);

    if (!photo) {
      setError("Selecione a foto de comprovação do serviço.");
      return;
    }
    const latValue = Number(lat);
    const lonValue = Number(lon);
    if (!lat || !lon || Number.isNaN(latValue) || Number.isNaN(lonValue)) {
      setError("Informe a latitude e a longitude do local.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ photo, lat: latValue, lon: lonValue, capturedAt: new Date().toISOString() });
      onClose();
    } catch {
      setError("Falha ao concluir a ordem de serviço. Confira a foto e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Concluir Ordem de Serviço</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.hint}>
            A foto é obrigatória: os metadados de localização e data são comparados com o que foi
            informado aqui para confirmar a execução do serviço.
          </p>

          <label className={styles.fileLabel}>
            <Camera size={18} />
            {photo ? photo.name : "Tirar foto"}
            <input
              type="file"
              accept="image/jpeg"
              capture="environment"
              className={styles.fileInput}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setPhoto(file);
                setPhotoPreviewUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev);
                  return file ? URL.createObjectURL(file) : null;
                });
              }}
            />
          </label>

          {photoPreviewUrl && (
            <img src={photoPreviewUrl} alt="Prévia da foto" className={styles.photoPreview} />
          )}

          {geoDenied && (
            <div className={styles.coordsRow}>
              <div className={styles.field}>
                <label className={styles.label}>Latitude</label>
                <input
                  type="number"
                  step="any"
                  className={styles.input}
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Longitude</label>
                <input
                  type="number"
                  step="any"
                  className={styles.input}
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                />
              </div>
            </div>
          )}
          {!geoDenied && lat && lon && (
            <p className={styles.hint}>
              Localização capturada: {Number(lat).toFixed(5)}, {Number(lon).toFixed(5)}
            </p>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submitButton} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Enviando..." : "Concluir com foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
