import { useState } from "react";
import useSWRImmutable from "swr/immutable";
import { jwtDecode } from "jwt-decode";
import { Download, FileText } from "lucide-react";
import { api, fetcher } from "@/services/api";
import { useAuth } from "@/contexts/AuthContext";
import styles from "@/styles/pages/Home/Reports/index.module.css";

interface TokenPayload {
  role?: string;
}

interface GeneratedReport {
  id: string;
  reportType: string;
  period: string;
  format: string;
  roadName: string | null;
  generatedByEmail: string | null;
  generatedAt: string;
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  artesp_monthly: "ARTESP Mensal",
  antt_annual: "ANTT Anual",
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportsPartial() {
  const { token } = useAuth();

  const isAdmin = (() => {
    if (!token) return false;
    try {
      return jwtDecode<TokenPayload>(token).role === "manager";
    } catch {
      return false;
    }
  })();

  const [month, setMonth] = useState(currentMonth());
  const [monthRoad, setMonthRoad] = useState("");
  const [monthFormat, setMonthFormat] = useState<"pdf" | "csv">("pdf");

  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [yearRoad, setYearRoad] = useState("");
  const [yearFormat, setYearFormat] = useState<"pdf" | "csv">("pdf");

  const [downloading, setDownloading] = useState<"monthly" | "annual" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: history, mutate: mutateHistory } = useSWRImmutable<GeneratedReport[]>(
    token && isAdmin ? ["/v1/reports/generated", token] : null,
    ([url, t]) => fetcher<GeneratedReport[]>(url, t as string),
  );

  const handleDownload = async (
    kind: "monthly" | "annual",
    period: string,
    roadName: string,
    format: "pdf" | "csv",
  ) => {
    setError(null);
    setDownloading(kind);
    try {
      const params: Record<string, string> = { format };
      if (kind === "monthly") params.month = period;
      else params.year = period;
      if (roadName) params.roadName = roadName;

      const { blob, filename } = await api.download(`/v1/reports/${kind}`, params);
      triggerDownload(blob, filename);
      mutateHistory();
    } catch {
      setError("Falha ao gerar o relatório.");
    } finally {
      setDownloading(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.container}>
          <p className={styles.message}>Relatórios disponíveis só para gestores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Relatórios</h1>
          <p className={styles.subtitle}>
            Relatórios de conservação de vegetação para as agências reguladoras.
          </p>
        </div>

        {error && <p className={styles.messageError}>{error}</p>}

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Mensal — ARTESP</h2>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Mês</span>
              <input
                type="month"
                className={styles.filterInput}
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Rodovia</span>
              <input
                type="text"
                placeholder="Opcional"
                className={styles.filterInput}
                value={monthRoad}
                onChange={(e) => setMonthRoad(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Formato</span>
              <select
                className={styles.filterSelect}
                value={monthFormat}
                onChange={(e) => setMonthFormat(e.target.value as "pdf" | "csv")}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button
              className={styles.buttonPrimary}
              onClick={() => handleDownload("monthly", month, monthRoad, monthFormat)}
              disabled={downloading === "monthly"}
            >
              <Download size={14} /> {downloading === "monthly" ? "Gerando..." : "Baixar"}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Anual — ANTT</h2>
          <div className={styles.filterBar}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Ano</span>
              <input
                type="number"
                min="2000"
                max="2100"
                className={styles.filterInput}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Rodovia</span>
              <input
                type="text"
                placeholder="Opcional"
                className={styles.filterInput}
                value={yearRoad}
                onChange={(e) => setYearRoad(e.target.value)}
              />
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>Formato</span>
              <select
                className={styles.filterSelect}
                value={yearFormat}
                onChange={(e) => setYearFormat(e.target.value as "pdf" | "csv")}
              >
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <button
              className={styles.buttonPrimary}
              onClick={() => handleDownload("annual", year, yearRoad, yearFormat)}
              disabled={downloading === "annual"}
            >
              <Download size={14} /> {downloading === "annual" ? "Gerando..." : "Baixar"}
            </button>
          </div>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Histórico de gerações</h2>
          {!history || history.length === 0 ? (
            <p className={styles.message}>Nenhum relatório gerado ainda.</p>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Relatório</th>
                    <th>Período</th>
                    <th>Formato</th>
                    <th>Rodovia</th>
                    <th>Gerado por</th>
                    <th>Gerado em</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <FileText size={14} />{" "}
                        {REPORT_TYPE_LABELS[item.reportType] ?? item.reportType}
                      </td>
                      <td>{item.period}</td>
                      <td>{item.format.toUpperCase()}</td>
                      <td>{item.roadName ?? "-"}</td>
                      <td>{item.generatedByEmail ?? "-"}</td>
                      <td>{new Date(item.generatedAt).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
