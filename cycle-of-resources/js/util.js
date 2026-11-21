/* Цикл ресурсов — утилиты интерфейса и форматирования. */
(function () {
  const COR = window.COR = window.COR || {};
  const UNITS = ["", "к", "М", "Б", "Т", "Кв", "Кн", "Сх", "Сп", "Ок", "Но", "Дк"];

  function fmt(n) {
    if (n === Infinity) return "∞";
    if (n === -Infinity) return "−∞";
    if (!Number.isFinite(n)) return "—";
    const sign = n < 0 ? "−" : "";
    let v = Math.abs(n);
    if (v < 0.0001) return "0";
    let i = 0;
    while (v >= 1000 && i < UNITS.length - 1) { v /= 1000; i += 1; }
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    let s = v.toFixed(digits);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    s = s.replace(".", ",");
    return sign + s + (i ? "\u00A0" + UNITS[i] : "");
  }

  function fmtSigned(n) {
    if (n > 0) return "+" + fmt(n);
    return fmt(n);
  }

  function fmtRate(n) {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n) > 0 && Math.abs(n) < 0.01) {
      return (n > 0 ? "+" : "−") + "0,01";
    }
    return fmtSigned(n);
  }

  function fmtInt(n) {
    if (!Number.isFinite(n)) return "—";
    return Math.round(n).toLocaleString("ru-RU");
  }

  function formatDuration(seconds, short) {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const total = Math.floor(seconds);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (d > 0) return short ? `${d} д ${h} ч` : `${d} д ${h} ч ${m} мин`;
    if (h > 0) return short ? `${h} ч ${m} мин` : `${h} ч ${m} мин ${s} с`;
    if (m > 0) return short ? `${m} мин` : `${m} мин ${s} с`;
    return `${s} с`;
  }

  function formatClock(ts) {
    const d = new Date(ts || Date.now());
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function formatDate(ts) {
    const d = new Date(ts || Date.now());
    const p = (x) => String(x).padStart(2, "0");
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
  }

  function plural(n, one, few, many) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return many;
    if (last > 1 && last < 5) return few;
    if (last === 1) return one;
    return many;
  }

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sum(obj) {
    let total = 0;
    for (const v of Object.values(obj || {})) total += v;
    return total;
  }

  function copyText(text) {
    return new Promise((resolve) => {
      const fallback = () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = text;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand("copy");
          document.body.removeChild(ta);
          resolve(ok);
        } catch (e) {
          resolve(false);
        }
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => resolve(true)).catch(fallback);
      } else {
        fallback();
      }
    });
  }

  function downloadText(filename, text, mime) {
    try {
      const blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  COR.util = {
    fmt, fmtSigned, fmtRate, fmtInt, formatDuration, formatClock, formatDate,
    plural, clamp, escapeHtml, sum, copyText, downloadText, debounce, prefersReducedMotion
  };
})();
