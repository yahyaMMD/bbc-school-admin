/**
 * API client for live BBC School backend.
 */
const BBC_API = (() => {
  const TOKEN_KEY = "bbc_api_token";
  const ROLE_KEY = "bbc_api_role";
  const RESTORE_KEY = "bbc_director_restore";
  const IMPERSONATE_KEY = "bbc_impersonating";
  const IMPERSONATE_NAME_KEY = "bbc_impersonate_name";

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
    sessionStorage.removeItem(RESTORE_KEY);
    sessionStorage.removeItem(IMPERSONATE_KEY);
    sessionStorage.removeItem(IMPERSONATE_NAME_KEY);
  }

  function isImpersonating() {
    return sessionStorage.getItem(IMPERSONATE_KEY) === "1";
  }

  function impersonateName() {
    return sessionStorage.getItem(IMPERSONATE_NAME_KEY) || "";
  }

  async function enterAsTeacher(teacherId) {
    const role = getRole();
    if (role !== "director") {
      throw new Error("Only the director can open a teacher portal");
    }
    sessionStorage.setItem(
      RESTORE_KEY,
      JSON.stringify({ token: getToken(), role: getRole() })
    );
    const data = await request(`/teachers/${encodeURIComponent(teacherId)}/impersonate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setSession(data.token, data.role);
    sessionStorage.setItem(IMPERSONATE_KEY, "1");
    sessionStorage.setItem(IMPERSONATE_NAME_KEY, data.teacherName || "");
    return data;
  }

  function exitImpersonation() {
    const raw = sessionStorage.getItem(RESTORE_KEY);
    if (!raw) return false;
    try {
      const saved = JSON.parse(raw);
      if (!saved?.token || !saved?.role) return false;
      setSession(saved.token, saved.role);
      sessionStorage.removeItem(RESTORE_KEY);
      sessionStorage.removeItem(IMPERSONATE_KEY);
      sessionStorage.removeItem(IMPERSONATE_NAME_KEY);
      return true;
    } catch {
      return false;
    }
  }

  async function request(path, options = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const attempt = async () => {
      const res = await fetch(`/api${path}`, { ...options, headers });
      const text = await res.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // nginx/HTML errors (502 etc.) — keep message short
        const looksHtml = /<!DOCTYPE|<html/i.test(text || "");
        const msg = looksHtml
          ? res.status === 502
            ? "Server temporarily unavailable (502). Please retry."
            : `Request failed (${res.status})`
          : text || res.statusText;
        data = { error: msg };
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText || "Request failed");
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    };
    try {
      return await attempt();
    } catch (err) {
      // One retry on gateway/restart blips
      if (err && (err.status === 502 || err.status === 503 || err.status === 504)) {
        await new Promise((r) => setTimeout(r, 800));
        return attempt();
      }
      throw err;
    }
  }

  async function login(password, roleHint, phone, loginCode) {
    const body = { password };
    if (roleHint) body.role = roleHint;
    if (loginCode) body.loginCode = loginCode;
    else if (phone) body.phone = phone;
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

  /** Fetch binary with auth; returns { url, blob, contentType }. */
  async function getBlob(path) {
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
    const contentType = res.headers.get("Content-Type") || blob.type || "";
    return { url: URL.createObjectURL(blob), blob, contentType };
  }

  /** Fetch binary (e.g. WhatsApp QR PNG) with auth; returns an object URL. */
  async function getBlobUrl(path) {
    const { url } = await getBlob(path);
    return url;
  }

  return {
    getToken,
    getRole,
    login,
    logout,
    isAuthenticated,
    isImpersonating,
    impersonateName,
    enterAsTeacher,
    exitImpersonation,
    loadSchoolData,
    uploadPhoto,
    removePhoto,
    readFileAsDataUrl,
    getBlob,
    getBlobUrl,
    request,
    get: (p) => request(p),
    post: (p, body) => request(p, { method: "POST", body: JSON.stringify(body) }),
    put: (p, body) => request(p, { method: "PUT", body: JSON.stringify(body) }),
    patch: (p, body) => request(p, { method: "PATCH", body: JSON.stringify(body) }),
    del: (p) => request(p, { method: "DELETE" }),
  };
})();
