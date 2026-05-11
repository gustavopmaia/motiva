import { useState } from "react";
import useSWRImmutable from "swr/immutable";
import { fetcher } from "@/services/api";
import { SearchBar } from "@/components/ui/SearchBar";
import { RoadSegmentCard } from "@/components/ui/RoadSegmentCard";
import { Pagination } from "@/components/ui/Pagination";
import { useAuth } from "@/contexts/AuthContext";
import styles from "@/styles/pages/Home/Gallery/index.module.css";

interface RoadSegment {
  id: string;
  roadName: string;
  kmStart: number;
  kmEnd: number;
  mowingType: string;
  scoreCurrent: number;
  scoreDivergent: boolean;
  image?: string;
}

export function GalleryPartial() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 12;

  const { data, error, isLoading } = useSWRImmutable<RoadSegment[]>(
    token ? ["/v1/road-segments", token] : null,
    ([url, t]) => fetcher<RoadSegment[]>(url, t as string),
  );

  const filteredData =
    data?.filter(
      (item) =>
        item.roadName.toLowerCase().includes(search.toLowerCase()) ||
        item.mowingType.toLocaleLowerCase().includes(search.toLowerCase()),
    ) || [];

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Galeria</h1>
        <SearchBar
          value={search}
          onChange={handleSearchChange}
          placeholder="Buscar por rodovia ou tipo de corte..."
        />
      </div>

      {isLoading && <p className={styles.message}>Carregando...</p>}
      {error && <p className={styles.messageError}>Erro ao carregar dados.</p>}

      {!isLoading && !error && (
        <>
          {filteredData.length === 0 ? (
            <p className={styles.message}>Nenhum segmento encontrado.</p>
          ) : (
            <div className={styles.grid}>
              {paginatedData.map((segment) => (
                <RoadSegmentCard key={segment.id} {...segment} />
              ))}
            </div>
          )}

          <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
