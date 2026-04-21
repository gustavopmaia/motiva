import axios from "axios";

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  headers: { "Content-Type": "application/json" },
});

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await client.request<T>({ url: path, method, data: body });
  return response.data;
}

export const fetcher = <T>(path: string): Promise<T> => request<T>(path, "GET");

export const api = {
  post: <T>(path: string, body?: unknown) => request<T>(path, "POST", body),
  put: <T>(path: string, body?: unknown) => request<T>(path, "PUT", body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, "PATCH", body),
  delete: <T>(path: string) => request<T>(path, "DELETE"),
};
