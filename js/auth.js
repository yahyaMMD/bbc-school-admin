/**
 * Session — password alone selects Director, Global view, Staff/admin, or WhatsApp.
 * Teachers use login ID (TR001…) + password via teacher login.
 * Floor managers use FLOOR001… + password.
 *
 * Isolation:
 * - global (GlobalView2026): full school browse + every console
 * - director (Director2026): school browse + timetables + floor reports only
 * - teacher / floor / admin / WhatsApp sessions are locked to their own area
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

  /** Limited or full leadership browse (director + global) */
  function isDirector() {
    return role() === "director" || role() === "global";
  }

  /** Full interfaces (Manage / WhatsApp / teacher portals / floor access) */
  function isGlobalView() {
    return role() === "global";
  }

  function isWhatsApp() {
    return role() === "whatsapp";
  }

  function isPreschool() {
    return role() === "preschool";
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

  /** Only Global view (or staff admin) may open Manage console */
  function canManage() {
    return isAdmin() || isGlobalView();
  }

  /** Only Global view (or WhatsApp role) may open WhatsApp console */
  function canWhatsApp() {
    return isWhatsApp() || isGlobalView();
  }

  function canPreschool() {
    return isPreschool() || isGlobalView();
  }

  function homePath() {
    if (isImpersonating() || isTeacher()) return "/my";
    if (isFloor()) return "/floor";
    if (isAdmin()) return "/manage";
    if (isWhatsApp()) return "/whatsapp";
    if (isPreschool()) return "/preschool";
    return "/home";
  }

  /**
   * Path allow-list per role. Returns true if the hash path is permitted.
   * `path0` is the first segment (e.g. "my", "floor", "manage").
   */
  function canAccessPath(path0) {
    const p = String(path0 || "home").replace(/^\//, "") || "home";
    if (isTeacher()) return p === "my";
    if (isFloor()) return p === "floor";
    if (isAdmin()) return p === "manage";
    if (isWhatsApp()) return p === "whatsapp";
    if (isPreschool()) return p === "preschool";
    if (isGlobalView()) {
      const allowed = new Set([
        "home",
        "search",
        "teachers",
        "students",
        "teacher",
        "student",
        "dept",
        "manage",
        "whatsapp",
        "preschool",
        "enter-teacher",
        "floor-access",
        "floor-reports",
        "timetable",
        "issues",
      ]);
      return allowed.has(p);
    }
    if (role() === "director") {
      // Limited Directrice: browse school + timetables + floor reports
      const allowed = new Set([
        "home",
        "search",
        "teachers",
        "students",
        "teacher",
        "student",
        "dept",
        "floor-reports",
        "timetable",
        "issues",
      ]);
      return allowed.has(p);
    }
    return false;
  }

  function exitToDirector() {
    if (typeof BBC_API !== "undefined" && !BBC_API.exitImpersonation()) return false;
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
    isGlobalView,
    isWhatsApp,
    isPreschool,
    isTeacher,
    isFloor,
    isImpersonating,
    canManage,
    canWhatsApp,
    canPreschool,
    canAccessPath,
    homePath,
    exitToDirector,
  };
})();
