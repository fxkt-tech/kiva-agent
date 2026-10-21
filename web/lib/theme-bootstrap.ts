import { WEB_PREFERENCES_KEY } from "../shared/web-preferences";

// Only an allowlisted theme reaches the DOM. No stored content is interpolated into script.
export const themeBootstrapScript = `(function(){try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(WEB_PREFERENCES_KEY)}));var t=p&&p.version===1&&p.appearance&&p.appearance.theme;if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}else{document.documentElement.removeAttribute("data-theme");}}catch(_){document.documentElement.removeAttribute("data-theme");}})();`;
