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

  async function login(password, roleHint) {
    const body = { password };
    if (roleHint) body.role = roleHint;
    const data = await request("/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
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

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No file selected"));
      if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
        return reject(new Error("Use JPG, PNG, WEBP or GIF"));
      }
      if (file.size > 4 * 1024 * 1024) {
        return reject(new Error("Image must be under 4 MB"));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read image"));
      reader.readAsDataURL(file);
    });
  }

  /** Upload profile photo to VPS and save URL on the student/teacher record. */
  async function uploadPhoto({ entity, id, file }) {
    const dataUrl = await readFileAsDataUrl(file);
    return request("/uploads/photo", {
      method: "POST",
      body: JSON.stringify({ entity, id, dataUrl }),
    });
  }

  async function removePhoto({ entity, id }) {
    return request("/uploads/photo", {
      method: "DELETE",
      body: JSON.stringify({ entity, id }),
    });
  }

  /** Fetch binary (e.g. WhatsApp QR PNG) with auth; returns an object URL. */
  async function getBlobUrl(path) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api${path}`, { headers });
    if (!res.ok) {
      const text = await res.text();
      let msg = res.statusText || "Request failed";
      try {
        const data = text ? JSON.parse(text) : null;
        if (data && data.error) msg = data.error;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  return {
    getToken,
    getRole,
    login,
    logout,
    isAuthenticated,
    loadSchoolData,
    uploadPhoto,
    removePhoto,
    readFileAsDataUrl,
    getBlobUrl,
    request,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: "POST", body: JSON.stringify(body) }),
    put: (p, body) => request(p, { method: "PUT", body: JSON.stringify(body) }),
    del: (p) => request(p, { method: "DELETE" }),
  };
})();
