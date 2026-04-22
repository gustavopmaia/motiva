import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@layouts/RootLayout";
import { HomePage } from "@pages/HomePage";
import { NotFoundPage } from "@pages/NotFoundPage";
import { LoginPage } from "@/pages/LoginPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
    ],
  },
  { path: "/auth", element: <LoginPage /> },
  {
    path: "*", // SEMPRE AO FINAL, TODAS AS ROTAS DA APLICAÇÃO ACIMA
    element: <NotFoundPage />,
  },
]);
