/**
 * API client for live BBC School backend.
 */
const BBC_API = (() => {
  const TOKEN_KEY = "bbc_api_token";
  const ROLE_KEY = "bbc_api_role";

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || "";
  }

  function getRole() {
    return sessionStorage.getItem(ROLE_KEY) || "";
  }

  function setSession(token, role) {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(ROLE_KEY, role);
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROLE_KEY);
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { ...options, headers });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { error: text || res.statusText };
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function login(role, password) {
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ role, password }),
    });
    setSession(data.token, data.role);
    return data;
  }

  function logout() {
    clearSession();
  }

  function isAuthenticated() {
    return Boolean(getToken() && getRole());
  }

  async function loadSchoolData() {
    return request("/school-data");
  }

  return {
    getToken,
    getRole,
    login,
    logout,
    isAuthenticated,
    loadSchoolData,
    request,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: "POST", body: JSON.stringify(body) }),
    put: (p, body) => request(p, { method: "PUT", body: JSON.stringify(body) }),
    del: (p) => request(p, { method: "DELETE" }),
  };
})();
