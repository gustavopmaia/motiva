import { Background } from "@/components/ui/Background";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthGuard } from "@/middleware/Middleware";
import { api } from "@/services/api";
import styles from "@/styles/pages/Login/index.module.css";
import { Compass } from "lucide-react";
import { useState } from "react";

export function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <AuthGuard access="admin">
      <Background>
        <div className={styles.top_container}>
          <Compass />
          <h2 id={styles.title}>Cultiva</h2>
        </div>
        <div className={styles.container}>
          <p className={styles.description}>Cadastre os demais usuários</p>
          <Input
            prefixIcon="user"
            label="Nome"
            id="name"
            placeholder="nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            onClick={async () => {
              const result = await api.post("/v1/auth/register", {
                email: email,
                name: name,
                password: password,
              });

              console.log(result);
            }}
            disabled={!name.trim() || !email.trim() || !password.trim()}
          >
            Entrar
          </Button>
        </div>
      </Background>
    </AuthGuard>
  );
}
