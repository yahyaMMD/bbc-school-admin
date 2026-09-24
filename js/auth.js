/**
 * Session — password alone selects Director, Staff/admin, or WhatsApp.
 * Teachers use phone + password via teacher login.
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

  function isWhatsApp() {
    return role() === "whatsapp";
  }

  function isTeacher() {
    return role() === "teacher";
  }

  function homePath() {
    if (isAdmin()) return "/manage";
    if (isWhatsApp()) return "/whatsapp";
    if (isTeacher()) return "/my";
    return "/home";
  }

  async function login(password, opts = {}) {
    try {
      const data = await BBC_API.login(password, opts.roleHint, opts.phone);
      return {
        ok: true,
        role: data.role,
        teacherId: data.teacherId,
        mustChangePassword: data.mustChangePassword,
      };
    } catch (err) {
      const msg =
        typeof I18n !== "undefined" ? I18n.t("loginError") : "Incorrect password";
      return { ok: false, error: err.message || msg };
    }
  }

  function logout() {
    if (typeof BBC_API !== "undefined") BBC_API.logout();
    if (typeof TeacherApp !== "undefined" && TeacherApp.reset) TeacherApp.reset();
  }

  return {
    isAuthenticated,
    login,
    logout,
    role,
    isAdmin,
    isDirector,
    isWhatsApp,
    isTeacher,
    homePath,
  };
})();
