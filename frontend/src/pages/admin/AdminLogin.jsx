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
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
      <div className="bg-[#1a1d27] border border-white/10 rounded-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-[var(--brand-text)] text-xs font-bold uppercase tracking-widest mb-1">Zagruzka</div>
          <div className="text-white text-lg font-semibold">Admin Login</div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-[#12151f] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--brand-border)]"
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#12151f] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 outline-none focus:border-[var(--brand-border)]"
              required
            />
          </div>
          {error && <div className="text-red-400 text-xs">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[var(--brand)] hover:bg-[var(--brand-text)] text-gray-900 font-semibold rounded-lg py-2 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
