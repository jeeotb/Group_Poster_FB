/* Group Poster v2 — hàm dùng chung (side panel + background). */
(function (root) {
  const GP = {};
  GP.VERSION = "2.0.0";

  GP.DEFAULT_CATEGORIES = [
    { id: "cat_qranty", name: "Qranty", color: "#2563EB" },
    { id: "cat_gcalls", name: "Gcalls", color: "#16A34A" },
    { id: "cat_wistorix", name: "Wistorix", color: "#7C3AED" },
    { id: "cat_humaninterior", name: "Human Interior", color: "#D97706" }
  ];
  GP.PALETTE = ["#0EA5E9", "#DB2777", "#0D9488", "#EA580C", "#4F46E5", "#65A30D", "#B91C1C", "#475569"];
  GP.DEFAULT_SETTINGS = { minGapMin: 3, dailyLimit: 20, repostDays: 7, sheetUrl: "", sheetKey: "", userName: "", lastPull: 0, syncError: "" };
  GP.STATUS = {
    posted: { label: "Đã đăng", cls: "ok" },
    review: { label: "Chờ duyệt", cls: "wait" },
    skipped: { label: "Bỏ qua", cls: "skip" },
    error: { label: "Lỗi", cls: "err" }
  };
  GP.DONE = ["posted", "review"];
  GP.GST = {
    san_sang: { dot: "#22C55E", label: "Sẵn sàng đăng" },
    cho_duyet_tham_gia: { dot: "#F59E0B", label: "Chờ duyệt tham gia" },
    chua_tham_gia: { dot: "#94A3B8", label: "Chưa tham gia" },
    link_loi: { dot: "#EF4444", label: "Link lỗi / bị gỡ" },
    khong_xac_dinh: { dot: "#CBD5E1", label: "Chưa xác định" }
  };
  GP.KEYS = ["categories", "groups", "posts", "logs", "history", "settings", "active", "ui", "syncQueue", "scan"];

  GP.uid = (p) => (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  GP.esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  GP.normKw = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
  GP.dayKey = (d) => { d = new Date(d); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  GP.fmtN = (n) => { n = +n || 0; if (!n) return "—"; return n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(".", ",") + "K" : String(n); };
  GP.fmtD = (d) => { d = new Date(d); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0"); };
  GP.timeAgo = function (ts) {
    if (!ts) return "—";
    const m = Math.floor((Date.now() - ts) / 60000);
    if (m < 1) return "vừa xong";
    if (m < 60) return m + " phút trước";
    const h = Math.floor(m / 60);
    if (h < 24) return h + " giờ trước";
    const d = Math.floor(h / 24);
    return d === 1 ? "hôm qua" : d + " ngày trước";
  };

  /* link group */
  GP.normalizeGroupUrl = function (raw) {
    let s = String(raw || "").trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
    let u;
    try { u = new URL(s); } catch (e) { return null; }
    if (!/(^|\.)facebook\.com$/i.test(u.hostname) && !/(^|\.)fb\.com$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/groups\/([^\/?#]+)/i);
    if (!m) return null;
    let slug = m[1];
    try { slug = decodeURIComponent(slug); } catch (e) {}
    return { key: slug.toLowerCase(), slug, url: "https://www.facebook.com/groups/" + encodeURIComponent(slug) + "/" };
  };
  GP.groupKey = (url) => (GP.normalizeGroupUrl(url) || {}).key || String(url || "").toLowerCase();
  GP.nameFromSlug = (slug) => (/^\d+$/.test(slug) ? "Group " + slug : slug.replace(/[-_.]+/g, " ").replace(/\s+/g, " ").trim());
  GP.parseCount = function (s) {
    s = String(s || "").trim().toLowerCase();
    const m = s.match(/^([\d.,]+)\s*(k|n|nghìn|ngàn|m|tr|triệu)?$/);
    if (!m) return 0;
    if (m[2]) {
      let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (m[1].includes(".") && !m[1].includes(",")) v = parseFloat(m[1]);
      return Math.round(v * (/^(k|n|nghìn|ngàn)$/.test(m[2]) ? 1e3 : 1e6));
    }
    return parseInt(m[1].replace(/[.,]/g, ""), 10) || 0;
  };

  /* nội dung */
  GP.spin = function (text) {
    let t = String(text || "");
    const re = /\{([^{}]*\|[^{}]*)\}/;
    let guard = 0;
    while (re.test(t) && guard++ < 500) t = t.replace(re, (_, b) => { const o = b.split("|"); return o[Math.floor(Math.random() * o.length)]; });
    return t;
  };
  GP.variants = (post) => ((post && post.variants) || []).filter((v) => String(v).trim());
  GP.buildText = function (post, logs) {
    const vs = GP.variants(post);
    if (!vs.length) return { text: "", variant: 0 };
    let n = 0;
    for (const k in logs) if (k.startsWith(post.id + "|") && GP.DONE.includes(logs[k].status)) n++;
    const variant = n % vs.length;
    return { text: GP.spin(vs[variant]), variant };
  };
  GP.lastPostInGroup = function (gid, history) {
    let best = 0;
    for (const h of history || []) if (h.groupId === gid && GP.DONE.includes(h.status)) best = Math.max(best, h.ts || 0);
    return best;
  };
  GP.lastPostAny = (history, user) => {
    let best = 0;
    for (const h of history || []) if (GP.DONE.includes(h.status) && (!user || !h.user || h.user === user)) best = Math.max(best, h.ts || 0);
    return best;
  };
  GP.todayCount = (history, user) => {
    const k = GP.dayKey(Date.now());
    return (history || []).filter((h) => GP.DONE.includes(h.status) && h.date === k && (!user || !h.user || h.user === user)).length;
  };

  /* CSV */
  GP.parseCSV = function (text) {
    text = String(text || "").replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const sep = first.includes("\t") ? "\t" : (first.split(",").length >= first.split(";").length ? "," : ";");
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  };
  GP.toCSV = (rows) => "﻿" + rows.map((r) => r.map((v) => { const s = String(v == null ? "" : v); return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\r\n");
  GP.splitMulti = (s) => String(s || "").split(/[;|]/).map((x) => x.trim()).filter(Boolean);

  /* storage */
  GP.load = async function () {
    const d = await chrome.storage.local.get(GP.KEYS);
    return {
      categories: d.categories || GP.DEFAULT_CATEGORIES.slice(),
      groups: d.groups || [], posts: d.posts || [], logs: d.logs || {}, history: d.history || [],
      settings: Object.assign({}, GP.DEFAULT_SETTINGS, d.settings || {}),
      active: d.active || null, ui: d.ui || {}, syncQueue: d.syncQueue || [], scan: d.scan || null
    };
  };
  GP.ensureDefaults = async function () {
    const d = await chrome.storage.local.get(["categories", "settings"]);
    const s = {};
    if (!d.categories) s.categories = GP.DEFAULT_CATEGORIES;
    if (!d.settings) s.settings = GP.DEFAULT_SETTINGS;
    if (Object.keys(s).length) await chrome.storage.local.set(s);
  };

  /* ảnh — IndexedDB */
  GP.idb = (function () {
    let dbp = null;
    function open() {
      if (!dbp) dbp = new Promise((res, rej) => {
        const r = indexedDB.open("group-poster", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("images", { keyPath: "id" });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return dbp;
    }
    const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const store = async (mode) => (await open()).transaction("images", mode).objectStore("images");
    return {
      put: async (rec) => req((await store("readwrite")).put(rec)),
      get: async (id) => req((await store("readonly")).get(id)),
      del: async (id) => req((await store("readwrite")).delete(id)),
      all: async () => req((await store("readonly")).getAll()),
      clear: async () => req((await store("readwrite")).clear())
    };
  })();
  GP.blobToDataUrl = async function (blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return "data:" + (blob.type || "image/jpeg") + ";base64," + btoa(s);
  };
  GP.dataUrlToBlob = function (d) {
    const i = d.indexOf(",");
    const type = (d.slice(0, i).match(/data:([^;,]+)/) || [])[1] || "application/octet-stream";
    const bin = atob(d.slice(i + 1));
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    return new Blob([arr], { type });
  };
  GP.safeName = (s) => String(s || "").replace(/[\\/:*?"<>| -]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "bai-dang";

  /* ============ Google Sheet (Apps Script) ============ */
  async function parseResp(r) {
    const t = await r.text();
    try { return JSON.parse(t); } catch (e) {
      if (/doGet|doPost/.test(t)) throw new Error("Apps Script chưa có code: lưu code rồi triển khai Phiên bản mới.");
      if (/accounts\.google|ServiceLogin|Đăng nhập|Sign in/i.test(t) || /accounts\.google/.test(r.url)) throw new Error("Link bắt đăng nhập: đặt quyền truy cập “Bất kỳ ai” rồi triển khai lại.");
      throw new Error("Phản hồi không hợp lệ từ Apps Script.");
    }
  }
  GP.api = {
    async get(s, params) {
      if (!s.sheetUrl) throw new Error("Chưa nhập link Apps Script.");
      const u = new URL(s.sheetUrl);
      Object.entries(Object.assign({}, params, { key: s.sheetKey })).forEach(([k, v]) => u.searchParams.set(k, v));
      const r = await fetch(u.toString(), { redirect: "follow", cache: "no-store" });
      const j = await parseResp(r);
      if (!j.ok) throw new Error(j.error || "Lỗi Apps Script");
      return j;
    },
    async post(s, body) {
      if (!s.sheetUrl) throw new Error("Chưa nhập link Apps Script.");
      const r = await fetch(s.sheetUrl, {
        method: "POST", redirect: "follow", cache: "no-store",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(Object.assign({}, body, { key: s.sheetKey, user: s.userName || "" }))
      });
      const j = await parseResp(r);
      if (!j.ok) throw new Error(j.error || "Lỗi Apps Script");
      return j;
    }
  };

  GP.groupToRow = function (g, cats) {
    return {
      id: g.id, ten: g.name, link: g.url,
      category: (g.categories || []).map((id) => (cats.find((c) => c.id === id) || {}).name).filter(Boolean).join("; "),
      tu_khoa: (g.keywords || []).join("; "),
      thanh_vien: g.members || "", quyen_rieng_tu: g.privacy || "", tinh_trang: g.status || "",
      duyet_bai: g.approval === true ? "co" : g.approval === false ? "khong" : "",
      luat: g.rules || "", ghi_chu: g.note || "", ngay_them: g.addedAt ? GP.dayKey(g.addedAt) : ""
    };
  };
  GP.rowToGroup = function (r, cats) {
    const catIds = GP.splitMulti(r.category).map((name) => {
      let c = cats.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (!c) { c = { id: GP.uid("cat_"), name, color: GP.PALETTE[cats.length % GP.PALETTE.length] }; cats.push(c); }
      return c.id;
    });
    const n = GP.normalizeGroupUrl(r.link);
    return {
      id: String(r.id || GP.uid("g_")), name: String(r.ten || (n ? GP.nameFromSlug(n.slug) : "")), url: n ? n.url : String(r.link || ""),
      categories: [...new Set(catIds)], keywords: GP.splitMulti(r.tu_khoa).map(GP.normKw),
      members: +r.thanh_vien || 0, privacy: r.quyen_rieng_tu || "", status: r.tinh_trang || "",
      approval: r.duyet_bai === "co" ? true : r.duyet_bai === "khong" ? false : null,
      rules: r.luat || "", note: r.ghi_chu || "",
      addedAt: r.ngay_them ? new Date(r.ngay_them).getTime() || Date.now() : Date.now(),
      updatedAt: r.cap_nhat_luc ? new Date(r.cap_nhat_luc).getTime() || 0 : 0,
      updatedBy: r.nguoi_cap_nhat || ""
    };
  };

  /* hàng đợi đồng bộ */
  GP.enqueue = async function (op) {
    const d = await chrome.storage.local.get(["syncQueue", "settings"]);
    const s = Object.assign({}, GP.DEFAULT_SETTINGS, d.settings || {});
    if (!s.sheetUrl) return;
    const q = d.syncQueue || [];
    q.push(Object.assign({ t: Date.now() }, op));
    await chrome.storage.local.set({ syncQueue: q });
  };
  let flushing = null;
  GP.flush = function () {
    if (flushing) return flushing;
    flushing = (async () => {
      const d = await chrome.storage.local.get(["syncQueue", "settings"]);
      const s = Object.assign({}, GP.DEFAULT_SETTINGS, d.settings || {});
      let q = d.syncQueue || [];
      if (!s.sheetUrl || !q.length) return { ok: true, sent: 0 };
      let sent = 0;
      try {
        while (q.length) {
          const op = q[0];
          // gộp các thao tác cùng loại liên tiếp
          let n = 1;
          const merged = { action: op.action, rows: [...(op.rows || [])], ids: [...(op.ids || [])] };
          while (n < q.length && q[n].action === op.action && n < 40) { merged.rows.push(...(q[n].rows || [])); merged.ids.push(...(q[n].ids || [])); n++; }
          if (merged.action === "upsertGroups" || merged.action === "upsertCategories") {
            const byId = new Map(); merged.rows.forEach((r) => byId.set(r.id, Object.assign(byId.get(r.id) || {}, r))); merged.rows = [...byId.values()];
          }
          await GP.api.post(s, merged);
          sent += n;
          const cur = (await chrome.storage.local.get("syncQueue")).syncQueue || [];
          q = cur.slice(n);
          await chrome.storage.local.set({ syncQueue: q });
        }
        const st = Object.assign({}, (await chrome.storage.local.get("settings")).settings, { syncError: "" });
        await chrome.storage.local.set({ settings: st });
        return { ok: true, sent };
      } catch (e) {
        const st = Object.assign({}, (await chrome.storage.local.get("settings")).settings, { syncError: String(e.message || e) });
        await chrome.storage.local.set({ settings: st });
        return { ok: false, error: String(e.message || e), sent };
      }
    })().finally(() => { flushing = null; });
    return flushing;
  };

  /* kéo dữ liệu từ sheet về (sheet là nguồn gốc cho group + category) */
  GP.pull = async function () {
    await GP.flush();
    const D = await GP.load();
    const s = D.settings;
    if (!s.sheetUrl) return { ok: false, error: "Chưa kết nối Google Sheet." };
    try {
      const since = GP.dayKey(Date.now() - 90 * 864e5);
      const j = await GP.api.get(s, { action: "pull", since });
      const patch = {};
      // category
      let cats = D.categories.slice();
      if ((j.categories || []).length) {
        cats = j.categories.filter((r) => r.ten).map((r) => {
          const ex = D.categories.find((c) => c.id === r.id || c.name.toLowerCase() === String(r.ten).toLowerCase());
          return { id: String(r.id || (ex && ex.id) || GP.uid("cat_")), name: String(r.ten), color: String(r.mau || (ex && ex.color) || "#475569") };
        });
      } else if (cats.length) {
        await GP.api.post(s, { action: "upsertCategories", rows: cats.map((c) => ({ id: c.id, ten: c.name, mau: c.color })) });
      }
      // group
      let groups = D.groups;
      if ((j.groups || []).length) {
        const before = cats.length;
        groups = j.groups.filter((r) => r.link).map((r) => GP.rowToGroup(r, cats));
        // giữ dữ liệu riêng máy (không có trên sheet)
        groups.forEach((g) => { const loc = D.groups.find((x) => x.id === g.id); if (loc && loc.localStatus) g.localStatus = loc.localStatus; });
        if (cats.length > before) await GP.api.post(s, { action: "upsertCategories", rows: cats.slice(before).map((c) => ({ id: c.id, ten: c.name, mau: c.color })) });
      } else if (groups.length) {
        for (let i = 0; i < groups.length; i += 200) {
          await GP.api.post(s, { action: "upsertGroups", rows: groups.slice(i, i + 200).map((g) => GP.groupToRow(g, cats)) });
        }
      }
      // lịch sử đăng của cả đội
      const hist = D.history.slice();
      const seen = new Set(hist.map((h) => (h.ts || 0) + "|" + h.groupId + "|" + (h.user || "")));
      for (const r of j.logs || []) {
        const ts = new Date(r.thoi_gian).getTime() || 0;
        const k = ts + "|" + r.group_id + "|" + (r.nguoi_dang || "");
        if (seen.has(k)) continue;
        seen.add(k);
        const post = D.posts.find((p) => p.title === r.bai_dang);
        hist.push({ id: GP.uid("h_"), ts, date: String(r.ngay || GP.dayKey(ts)).slice(0, 10), postId: post ? post.id : "", postTitle: r.bai_dang, groupId: String(r.group_id), groupName: r.ten_group, status: r.trang_thai, user: r.nguoi_dang || "", remote: true });
      }
      Object.assign(patch, { categories: cats, groups, history: hist.slice(-5000), settings: Object.assign({}, s, { lastPull: Date.now(), syncError: "" }) });
      await chrome.storage.local.set(patch);
      return { ok: true, groups: groups.length, categories: cats.length };
    } catch (e) {
      await chrome.storage.local.set({ settings: Object.assign({}, s, { syncError: String(e.message || e) }) });
      return { ok: false, error: String(e.message || e) };
    }
  };

  root.GP = GP;
})(typeof self !== "undefined" ? self : window);
