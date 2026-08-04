import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import Cookies from "js-cookie";
import { TOKEN_COOKIE_KEY } from "@/helper/constants";

interface AuthContextType {
  token: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getCookie(name: string): string | undefined {
  return Cookies.get(name);
}

function deleteCookie(name: string) {
  Cookies.remove(name);
}
export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = getCookie(TOKEN_COOKIE_KEY);
    if (t) {
      setToken(t);
    }
  }, []);

  const logout = () => {
    setToken(null);
    deleteCookie(TOKEN_COOKIE_KEY);
  };

  return <AuthContext.Provider value={{ token, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
