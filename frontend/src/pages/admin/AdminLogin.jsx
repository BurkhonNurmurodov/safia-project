import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/api";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const form = new URLSearchParams({ username, password });
      const { data } = await api.post("/admin/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      localStorage.setItem("admin_token", data.access_token);
      navigate("/admin/upload");
    } catch {
      setError("Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
      <div className="bg-[var(--bg-card)] border border-[var(--border-md)] rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-[var(--brand-text)] text-xs font-bold uppercase tracking-widest mb-1">Safia</div>
          <div className="text-[var(--text-1)] text-lg font-semibold">Admin Login</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[var(--bg-inner)] border border-[var(--border-md)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-border)]"
              required
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-3)] mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[var(--bg-inner)] border border-[var(--border-md)] rounded-lg px-3 py-2 text-sm text-[var(--text-1)] outline-none focus:border-[var(--brand-border)]"
              required
            />
          </div>
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white font-semibold rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
