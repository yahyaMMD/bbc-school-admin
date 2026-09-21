/**
 * Simple client-side gate for presentation / admin access.
 * Password is verified locally (no server).
 * Default password: BBCSchool2026
 */

const Auth = (() => {
  const STORAGE_KEY = "bbc_admin_session";
  // Change ADMIN_PASSWORD below if needed.
  const ADMIN_PASSWORD = "BBCSchool2026";
  const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

  function isAuthenticated() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data?.ok || !data?.exp) return false;
      if (Date.now() > data.exp) {
        sessionStorage.removeItem(STORAGE_KEY);
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  function login(password) {
    if (typeof password !== "string" || password.trim() !== ADMIN_PASSWORD) {
      return { ok: false, error: "Incorrect password" };
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ok: true, exp: Date.now() + SESSION_TTL_MS })
    );
    return { ok: true };
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  return { isAuthenticated, login, logout, PASSWORD_HINT: "Contact administration" };
})();
