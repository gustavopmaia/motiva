import { jwtDecode } from "jwt-decode";
import useSWRImmutable from "swr/immutable";
import { BarChart2, Camera, ClipboardList, FileText } from "lucide-react";
import { fetcher } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import styles from "@/styles/pages/Home/Dashboard/index.module.css";

interface TokenPayload {
  role?: string;
}

interface DashboardSummary {
  segments: { total: number; averageScore: number | null; criticalCount: number };
  photoEvidence: { periodDays: number; verified: number; suspicious: number; missingExif: number };
  workOrders: {
    open: number;
    completed: number;
    critical: number;
    urgent: number;
    attention: number;
    overdue: number;
  };
  reports: { totalGenerated: number; lastGeneratedAt: string | null };
}

export function DashboardPartial() {
  const { token } = useAuth();

  const isAdmin = (() => {
    if (!token) return false;
    try {
      return jwtDecode<TokenPayload>(token).role === "manager";
    } catch {
      return false;
    }
  })();

  const { data, error } = useSWRImmutable<DashboardSummary>(
    token && isAdmin ? ["/v1/dashboard/summary", token] : null,
    ([url, t]) => fetcher<DashboardSummary>(url, t as string),
  );

  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <p className={styles.message}>Painel disponível só para gestores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Painel</h1>
          <p className={styles.subtitle}>Resumo operacional da conservação de vegetação.</p>
        </div>

        {error && <p className={styles.messageError}>Erro ao carregar o painel.</p>}

        {data && (
          <>
            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                <BarChart2 size={14} /> Malha viária
              </span>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Score médio (0–100)</span>
                  <span className={styles.statValue}>
                    {data.segments.averageScore != null
                      ? Math.round(data.segments.averageScore)
                      : "-"}
                  </span>
                  <span className={styles.statHint}>
                    {data.segments.criticalCount} de {data.segments.total} trechos em nível crítico
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                <ClipboardList size={14} /> Ordens de serviço
              </span>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Em aberto</span>
                  <span className={styles.statValue}>{data.workOrders.open}</span>
                  <div className={styles.breakdown}>
                    <span className={styles.breakdownItem}>
                      <span className={styles.dot} style={{ backgroundColor: "#dc2626" }} />
                      {data.workOrders.critical} crítica
                    </span>
                    <span className={styles.breakdownItem}>
                      <span className={styles.dot} style={{ backgroundColor: "#c2410c" }} />
                      {data.workOrders.urgent} urgente
                    </span>
                    <span className={styles.breakdownItem}>
                      <span className={styles.dot} style={{ backgroundColor: "#b45309" }} />
                      {data.workOrders.attention} atenção
                    </span>
                  </div>
                </div>

                <div
                  className={`${styles.statCard} ${data.workOrders.overdue > 0 ? styles.statCardAlert : ""}`}
                >
                  <span className={styles.statLabel}>Fora do prazo da prioridade</span>
                  <span
                    className={`${styles.statValue} ${data.workOrders.overdue > 0 ? styles.statValueAlert : ""}`}
                  >
                    {data.workOrders.overdue}
                  </span>
                  <span className={styles.statHint}>
                    Prazo estourado sem atendimento — escalam sozinhas no despacho
                  </span>
                </div>

                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Concluídas</span>
                  <span className={styles.statValue}>{data.workOrders.completed}</span>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                <Camera size={14} /> Evidência fotográfica (últimos {data.photoEvidence.periodDays}{" "}
                dias)
              </span>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Confirmadas</span>
                  <span className={styles.statValue}>{data.photoEvidence.verified}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Suspeitas</span>
                  <span className={styles.statValue}>{data.photoEvidence.suspicious}</span>
                </div>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Sem metadados</span>
                  <span className={styles.statValue}>{data.photoEvidence.missingExif}</span>
                </div>
              </div>
            </div>

            <div className={styles.section}>
              <span className={styles.sectionTitle}>
                <FileText size={14} /> Relatórios
              </span>
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <span className={styles.statLabel}>Gerados no total</span>
                  <span className={styles.statValue}>{data.reports.totalGenerated}</span>
                  <span className={styles.statHint}>
                    {data.reports.lastGeneratedAt
                      ? `Último em ${new Date(data.reports.lastGeneratedAt).toLocaleString("pt-BR")}`
                      : "Nenhum gerado ainda"}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
