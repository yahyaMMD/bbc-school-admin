/**
 * Session — password alone selects Director, Staff/admin, or WhatsApp.
 * Teachers use login ID (TR001…) + password via teacher login.
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

  function isFloor() {
    return role() === "floor";
  }

  function isImpersonating() {
    return typeof BBC_API !== "undefined" && BBC_API.isImpersonating();
  }

  /** Director may open Staff manage console */
  function canManage() {
    return isAdmin() || isDirector();
  }

  /** Director may open WhatsApp console */
  function canWhatsApp() {
    return isWhatsApp() || isDirector();
  }

  function homePath() {
    if (isImpersonating() || isTeacher()) return "/my";
    if (isFloor()) return "/floor";
    if (isAdmin()) return "/manage";
    if (isWhatsApp()) return "/whatsapp";
    return "/home";
  }

  function exitToDirector() {
    if (typeof BBC_API === "undefined" || !BBC_API.exitImpersonation()) return false;
    if (typeof TeacherApp !== "undefined" && TeacherApp.reset) TeacherApp.reset();
    if (typeof FloorApp !== "undefined" && FloorApp.reset) FloorApp.reset();
    return true;
  }

  async function login(password, opts = {}) {
    try {
      const data = await BBC_API.login(
        password,
        opts.roleHint,
        opts.phone,
        opts.loginCode
      );
      return {
        ok: true,
        role: data.role,
        teacherId: data.teacherId,
        floorManagerId: data.floorManagerId,
        loginCode: data.loginCode,
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
    if (typeof FloorApp !== "undefined" && FloorApp.reset) FloorApp.reset();
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
    isFloor,
    isImpersonating,
    canManage,
    canWhatsApp,
    homePath,
    exitToDirector,
  };
})();
