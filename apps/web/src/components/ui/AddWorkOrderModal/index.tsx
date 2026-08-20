import { X } from "lucide-react";
import styles from "./index.module.css";

export interface AvailableWorkOrder {
  id: string;
  segmentId: string;
  priority: "attention" | "urgent" | "critical";
  status: "open" | "in_progress" | "completed";
  team?: string | null;
  observation?: string | null;
}

interface AddWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrders: AvailableWorkOrder[];
  onAdd: (workOrderId: string) => void;
}

export function AddWorkOrderModal({ isOpen, onClose, workOrders, onAdd }: AddWorkOrderModalProps) {
  if (!isOpen) return null;

  const priorityLabelMap: Record<string, string> = {
    attention: "Atenção",
    urgent: "Urgente",
    critical: "Crítica",
  };

  const priorityClassMap: Record<string, string> = {
    attention: styles.badgeAttention,
    urgent: styles.badgeUrgent,
    critical: styles.badgeCritical,
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h3 className={styles.title}>Adicionar Ordem de Serviço à Rota</h3>
          <button className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className={styles.body}>
          {workOrders.length === 0 ? (
            <p className={styles.emptyText}>Nenhuma ordem de serviço disponível para adição.</p>
          ) : (
            <div className={styles.list}>
              {workOrders.map((wo) => (
                <div key={wo.id} className={styles.item}>
                  <div className={styles.itemInfo}>
                    <span className={styles.itemTitle}>Ordem: #{wo.id.slice(0, 8)}</span>
                    <span className={styles.itemSubtitle}>
                      Segmento: {wo.segmentId.slice(0, 8)}
                    </span>
                    {wo.observation && (
                      <span className={styles.itemSubtitle}>{wo.observation}</span>
                    )}
                    <span className={`${styles.badge} ${priorityClassMap[wo.priority] || ""}`}>
                      {priorityLabelMap[wo.priority] || wo.priority}
                    </span>
                  </div>
                  <button
                    className={styles.addButton}
                    onClick={() => {
                      onAdd(wo.id);
                      onClose();
                    }}
                  >
                    Adicionar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
