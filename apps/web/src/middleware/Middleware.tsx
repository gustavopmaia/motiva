import type { ReactNode } from "react";
import Cookies from "js-cookie";
import { jwtDecode } from "jwt-decode";
import { TOKEN_COOKIE_KEY } from "@/helper/constants";

type Props = {
  children: ReactNode;
  access: "public" | "private" | "admin";
};

type TokenPayload = {
  role?: string;
};

export function AuthGuard({ children, access }: Props) {
  const token = Cookies.get(TOKEN_COOKIE_KEY);

  if (!token) {
    if (access === "public") return <>{children}</>;
    window.location.replace("/");
    return null;
  }

  if (token && access === "public") {
    const payload = jwtDecode<TokenPayload>(token);
    if (payload.role !== "manager") {
      window.location.replace("/home");
      return null;
    }
    window.location.replace("/home");
    return null;
  }

  if (access === "admin") {
    try {
      const payload = jwtDecode<TokenPayload>(token);
      if (payload.role !== "manager") {
        window.location.replace("/home");
        return null;
      }
    } catch {
      window.location.replace("/");
      return null;
    }
  }

  return <>{children}</>;
}
