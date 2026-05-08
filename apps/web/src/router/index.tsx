import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@layouts/RootLayout";
import { HomePage } from "@pages/HomePage";
import { NotFoundPage } from "@pages/NotFoundPage";
import { LoginPage } from "@/pages/LoginPage";
import { SignUpPage } from "@/pages/SignUpPage";
import { BaseLayout } from "@/layouts/BaseLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <LoginPage />,
      },
    ],
  },
  { path: "/home", element: <BaseLayout />, children: [{ index: true, element: <HomePage /> }] },
  { path: "/sign-up", element: <SignUpPage /> },
  {
    path: "*", // SEMPRE AO FINAL, TODAS AS ROTAS DA APLICAÇÃO ACIMA
    element: <NotFoundPage />,
  },
]);
