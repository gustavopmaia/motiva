import { useEffect } from "react";
import {
  X,
  MapPin,
  BarChart2,
  Scissors,
  AlertTriangle,
  Users,
  FileText,
  Calendar,
  ShieldAlert,
  Compass,
  Navigation,
} from "lucide-react";
import styles from "./index.module.css";

const DIRECTION_LABELS: Record<string, string> = {
  norte: "Norte",
  sul: "Sul",
  leste: "Leste",
  oeste: "Oeste",
  unica: "Única",
};

const LOCATION_LABELS: Record<string, string> = {
  canteiro_central: "Canteiro central",
  faixa_1: "Faixa 1",
  faixa_2: "Faixa 2",
  lateral: "Lateral",
};

export interface MapPointDetail {
  id: string;
  type: "segment" | "alert" | "work_order";
  title: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType?: string | null;
  score?: number | null;
  level?: "normal" | "attention" | "urgent" | "critical" | "work_order";
  status?: string | null;
  priority?: string | null;
  team?: string | null;
  observation?: string | null;
  direction?: string | null;
  location?: string | null;
  createdAt?: string | null;
  image?: string | null;
}

interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  point: MapPointDetail | null;
}

export function DetailModal({ isOpen, onClose, point }: DetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !point) {
    return null;
  }

  const getTypeLabel = (type: MapPointDetail["type"]) => {
    switch (type) {
      case "segment":
        return "Trecho Rodoviário";
      case "alert":
        return "Alerta";
      case "work_order":
        return "Ordem de Serviço";
      default:
        return "Ponto";
    }
  };

  const getLevelLabel = (level?: MapPointDetail["level"]) => {
    switch (level) {
      case "normal":
        return "Normal / Baixo Risco";
      case "attention":
        return "Atenção";
      case "urgent":
        return "Urgente";
      case "critical":
        return "Crítico";
      case "work_order":
        return "Ordem de Serviço";
      default:
        return "Desconhecido";
    }
  };

  const getScoreColor = (score?: number | null) => {
    if (score == null) return "var(--color-text-muted)";
    if (score < 40) return "var(--color-success)";
    if (score < 70) return "var(--color-warning)";
    return "var(--color-error)";
  };

  const getStatusLabel = (status?: string | null) => {
    if (!status) return null;
    switch (status) {
      case "open":
        return "Aberta";
      case "in_progress":
        return "Em Andamento";
      case "completed":
        return "Concluída";
      case "pending_approval":
        return "Pendente de Aprovação";
      case "locked":
        return "Bloqueada";
      default:
        return status;
    }
  };

  const scoreValue = point.score != null ? Math.round(point.score) : null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose} aria-label="Fechar modal">
          <X size={20} />
        </button>

        {point.image && (
          <div className={styles.imageWrapper}>
            <img src={point.image} alt={point.title} className={styles.image} />
          </div>
        )}

        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.badgeRow}>
              <span className={styles.typeBadge}>{getTypeLabel(point.type)}</span>
              {point.level && (
                <span className={`${styles.levelBadge} ${styles[point.level]}`}>
                  <ShieldAlert size={14} />
                  {getLevelLabel(point.level)}
                </span>
              )}
            </div>
            <h2 className={styles.title}>{point.title}</h2>
            <div className={styles.subtitle}>
              <MapPin size={16} />
              <span>
                {point.roadName} - km {point.kmStart.toString().replace(".", ",")} até km{" "}
                {point.kmEnd.toString().replace(".", ",")}
              </span>
            </div>
          </div>

          <div className={styles.divider} />

          {scoreValue != null && (
            <div className={styles.scoreContainer}>
              <div className={styles.scoreHeader}>
                <span className={styles.label}>
                  <BarChart2 size={14} /> Score de Vegetação (0-100)
                </span>
                <span className={styles.value} style={{ color: getScoreColor(scoreValue) }}>
                  {scoreValue}
                </span>
              </div>
              <div className={styles.scoreBar}>
                <div
                  className={styles.scoreFill}
                  style={{
                    width: `${Math.min(Math.max(scoreValue, 0), 100)}%`,
                    backgroundColor: getScoreColor(scoreValue),
                  }}
                />
              </div>
            </div>
          )}

          <div className={styles.grid}>
            {point.mowingType && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <Scissors size={14} /> Tipo de Roçagem
                </span>
                <span className={styles.value}>{point.mowingType}</span>
              </div>
            )}

            {point.direction && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <Compass size={14} /> Pista
                </span>
                <span className={styles.value}>
                  {DIRECTION_LABELS[point.direction] ?? point.direction}
                </span>
              </div>
            )}

            {point.location && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <Navigation size={14} /> Local
                </span>
                <span className={styles.value}>
                  {LOCATION_LABELS[point.location] ?? point.location}
                </span>
              </div>
            )}

            {point.status && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <AlertTriangle size={14} /> Status
                </span>
                <span className={styles.value}>{getStatusLabel(point.status)}</span>
              </div>
            )}

            {point.priority && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <AlertTriangle size={14} /> Prioridade
                </span>
                <span className={styles.value}>
                  {getLevelLabel(point.priority as MapPointDetail["level"])}
                </span>
              </div>
            )}

            {point.team && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <Users size={14} /> Equipe de Manutenção
                </span>
                <span className={styles.value}>{point.team}</span>
              </div>
            )}

            {point.createdAt && (
              <div className={styles.gridItem}>
                <span className={styles.label}>
                  <Calendar size={14} /> Data de Registro
                </span>
                <span className={styles.value}>
                  {new Date(point.createdAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}

            {point.observation && (
              <div className={styles.gridItemFull}>
                <span className={styles.label}>
                  <FileText size={14} /> Observações
                </span>
                <span className={styles.value}>{point.observation}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
