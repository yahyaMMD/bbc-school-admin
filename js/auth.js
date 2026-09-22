/**
 * Session gate — Director (read) or Admin (manage).
 * Auth is verified by the API; token kept in sessionStorage.
 */
const Auth = (() => {
  function isAuthenticated() {
    return typeof BBC_API !== "undefined" && BBC_API.isAuthenticated();
  }

  function role() {
    return typeof BBC_API !== "undefined" ? BBC_API.getRole() : "";
  }

  function isAdmin() {
    return role() === "admin";
  }

  function isDirector() {
    return role() === "director";
  }

  async function login(selectedRole, password) {
    try {
      await BBC_API.login(selectedRole, password);
      return { ok: true, role: selectedRole };
    } catch (err) {
      return { ok: false, error: err.message || "Incorrect password" };
    }
  }

  function logout() {
    if (typeof BBC_API !== "undefined") BBC_API.logout();
  }

  return {
    isAuthenticated,
    login,
    logout,
    role,
    isAdmin,
    isDirector,
    PASSWORD_HINT: "Use the password for your access door",
  };
})();
