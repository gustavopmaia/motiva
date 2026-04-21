import Button from "@/components/ui/Button";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div>
      <h1>404</h1>
      <p>Página não encontrada.</p>
      <Link to="/">
        <Button>Home</Button>
        <Button disabled style={{ marginLeft: "10px" }}>
          Home
        </Button>
      </Link>
    </div>
  );
}
