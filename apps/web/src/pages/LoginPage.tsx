import { Background } from "@/components/ui/Background";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import styles from "@/styles/pages/Login/index.module.css";
import { Compass } from "lucide-react";
import { useState } from "react";

export function LoginPage() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  return (
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
          prefixIcon="user"
          label="Usuário"
          id="user"
          placeholder="usuário"
          value={user}
          onChange={(e) => setUser(e.target.value)}
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
        />
        <Button disabled={!user.trim() || !password.trim()}>Entrar</Button>
      </div>
    </Background>
  );
}
