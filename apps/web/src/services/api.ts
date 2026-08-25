import axios from "axios";
import Cookies from "js-cookie";
import { TOKEN_COOKIE_KEY } from "@/helper/constants";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE_KEY);
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const response = await client.request<T>({ url: path, method, data: body, headers });
  return response.data;
}

export const fetcher = <T>(path: string, token?: string): Promise<T> =>
  request<T>(path, "GET", undefined, token ? { Authorization: `Bearer ${token}` } : undefined);

export const api = {
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, "POST", body, headers),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, "PUT", body, headers),
  patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, "PATCH", body, headers),
  delete: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, "DELETE", undefined, headers),
};
