/**
 * Session — password alone selects Director (read) or Staff/admin (manage).
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

  async function login(password) {
    try {
      const data = await BBC_API.login(password);
      return { ok: true, role: data.role };
    } catch (err) {
      const msg =
        typeof I18n !== "undefined" ? I18n.t("loginError") : "Incorrect password";
      return { ok: false, error: err.message || msg };
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
  };
})();
