import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  headers: {
    "ngrok-skip-browser-warning": "true",
  },
  paramsSerializer: (params) => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) {
        value.forEach((v) => sp.append(key, v));
      } else if (value !== null && value !== undefined) {
        sp.append(key, value);
      }
    }
    return sp.toString();
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("tg_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
