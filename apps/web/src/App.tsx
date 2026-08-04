import { RouterProvider } from "react-router-dom";
import { router } from "@/router";
import { AuthProvider } from "@/contexts/AuthContext";
import "leaflet/dist/leaflet.css";

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
