import { Background } from "@/components/ui/Background";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api } from "@/services/api";
import styles from "@/styles/pages/Login/index.module.css";
import { Compass } from "lucide-react";
import { useState } from "react";
import Cookies from "js-cookie";
import { TOKEN_COOKIE_KEY } from "@/helper/constants";
import { AuthGuard } from "@/middleware/Middleware";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const response: { accessToken: string } = await api.post("/v1/auth/login", {
        email,
        password,
      });
      const token = response.accessToken;
      if (token) {
        Cookies.set(TOKEN_COOKIE_KEY, token, { expires: 2 });
      } else {
        setError("Ocorreu um erro inesperado. Tente novamente mais tarde.");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Erro ao fazer login. Verifique suas credenciais.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthGuard access="public">
      <Background>
        <div className={styles.top_container}>
          <Compass />
          <h2 id={styles.title}>Cultiva</h2>
        </div>
        <div className={styles.container}>
          <p className={styles.description}>
            Entre com suas credenciais para ter acesso à plataforma
          </p>
          <Input
            prefixIcon="email"
            label="E-mail"
            id="email"
            placeholder="e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            prefixIcon="lock"
            label="Senha"
            id="pwd"
            placeholder="senha"
            showPasswordToggle
            showForgotPassword
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && email && password && !loading) {
                handleLogin();
              }
            }}
          />
          {error && <div className={styles.error}>{error}</div>}
          <Button onClick={handleLogin} disabled={!email.trim() || !password.trim() || loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </Background>
    </AuthGuard>
  );
}
