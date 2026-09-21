/* Group Poster v2 — giao diện (side panel & toàn màn hình) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = GP.esc;
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_FULL = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

let S = null;
const UI = {
  view: "post", q: "", cat: "", kw: "", st: "", sort: "name", dir: 1, sel: new Set(), lastIdx: null, list: [],
  mode: "day", day: today0(), cal: null, open: null,
  pi: null, pv: 0, pq: "", hideNotReady: true, allCat: false, confirm: null,
  editing: null
};
UI.cal = new Date(UI.day.getFullYear(), UI.day.getMonth(), 1);
const thumbCache = new Map();

/* ===================== khởi động ===================== */
init();
async function init() {
  await GP.ensureDefaults();
  S = await GP.load();
  const full = /full=1/.test(location.search);
  const applyWidth = () => { const wide = full || window.innerWidth >= 760; document.body.classList.toggle("narrow", !wide); document.body.classList.toggle("wide", wide); $("#expandBtn").hidden = wide; };
  applyWidth();
  window.addEventListener("resize", () => { const was = document.body.classList.contains("narrow"); applyWidth(); if (was !== document.body.classList.contains("narrow")) renderView(); });
  $("#expandBtn").onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?full=1") });
  $("#syncBtn").onclick = () => (S.settings.sheetUrl ? doPull(true) : showView("settings"));
  $$(".tabs .tab").forEach((t) => (t.onclick = () => showView(t.dataset.v)));
  UI.view = S.ui.view || "post";
  UI.pi = S.ui.postId || null;

  let tmr = null;
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== "local") return;
    clearTimeout(tmr);
    tmr = setTimeout(async () => {
      S = await GP.load();
      renderSync();
      if (busyUI()) { if (ch.scan && UI.view === "group") renderScan(); return; }
      if (ch.groups || ch.categories || ch.logs || ch.history || ch.posts || ch.scan) {
        if (UI.view === "group" || UI.view === "post") renderView();
      }
    }, 120);
  });
  document.addEventListener("paste", (e) => {
    if (UI.view !== "content" || !UI.editing) return;
    const files = [...(e.clipboardData ? e.clipboardData.files : [])].filter((f) => f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); addImages(files); }
  });
  document.addEventListener("mousedown", (e) => { if (!e.target.closest(".pop") && !e.target.closest("[data-pop]")) closePops(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closePops(); closeDrawer(); closeModal(); } });
  $("#ov").addEventListener("mousedown", (e) => { if (e.target.id === "ov") closeDrawer(); });
  $("#mov").addEventListener("mousedown", (e) => { if (e.target.id === "mov") closeModal(); });

  showView(UI.view);
  renderSync();
  if (S.settings.sheetUrl && Date.now() - (S.settings.lastPull || 0) > 2 * 60000) doPull(false);
}
const busyUI = () => $("#ov").classList.contains("show") || $("#mov").classList.contains("show") || $$(".pop.show").length > 0 || (UI.view === "content" && UI.editing);

async function save(partial) { Object.assign(S, partial); await chrome.storage.local.set(partial); }
function saveUI(p) { S.ui = Object.assign({}, S.ui, p); chrome.storage.local.set({ ui: S.ui }); }
function showView(v) {
  UI.view = v;
  saveUI({ view: v });
  $$(".tabs .tab").forEach((t) => t.classList.toggle("on", t.dataset.v === v));
  ["post", "group", "content", "settings"].forEach((x) => { $("#view" + x[0].toUpperCase() + x.slice(1)).hidden = x !== v; });
  closePops();
  renderView();
  window.scrollTo(0, 0);
}
function renderView() {
  if (UI.view === "group") renderGroupTab();
  else if (UI.view === "content") renderContentTab();
  else if (UI.view === "settings") renderSettingsTab();
  else renderPostTab();
}

/* đồng bộ Google Sheet */
async function commitGroups(changed, deletedIds) {
  await save({ groups: S.groups });
  if (!S.settings.sheetUrl) return;
  if (changed && changed.length) await GP.enqueue({ action: "upsertGroups", rows: changed.map((g) => GP.groupToRow(g, S.categories)) });
  if (deletedIds && deletedIds.length) await GP.enqueue({ action: "deleteGroups", ids: deletedIds });
  chrome.runtime.sendMessage({ type: "flush" });
}
async function commitCategories(changed, deletedIds) {
  await save({ categories: S.categories });
  if (!S.settings.sheetUrl) return;
  if (changed && changed.length) await GP.enqueue({ action: "upsertCategories", rows: changed.map((c) => ({ id: c.id, ten: c.name, mau: c.color })) });
  if (deletedIds && deletedIds.length) await GP.enqueue({ action: "deleteCategories", ids: deletedIds });
  chrome.runtime.sendMessage({ type: "flush" });
}
let pulling = false;
async function doPull(showToast) {
  if (pulling) return;
  pulling = true; renderSync();
  const r = await chrome.runtime.sendMessage({ type: "pull" });
  pulling = false;
  S = await GP.load();
  renderSync();
  if (showToast) toast(r && r.ok ? `Đã đồng bộ: ${r.groups} group · ${r.categories} category` : "Lỗi đồng bộ: " + ((r && r.error) || ""), !(r && r.ok));
  if (!busyUI()) renderView();
}
function renderSync() {
  const b = $("#syncBtn"), t = $("#syncTxt"), s = S.settings;
  b.className = "synci";
  if (!s.sheetUrl) { t.textContent = "Chưa kết nối sheet"; b.title = "Vào Cài đặt để kết nối Google Sheet"; return; }
  if (pulling) { b.classList.add("busy"); t.textContent = "Đang đồng bộ…"; return; }
  if (s.syncError) { b.classList.add("err"); t.textContent = "Lỗi đồng bộ"; b.title = s.syncError; return; }
  if ((S.syncQueue || []).length) { b.classList.add("busy"); t.textContent = `Chờ gửi ${S.syncQueue.length} thay đổi`; b.title = "Bấm để đồng bộ lại"; return; }
  b.classList.add("ok"); t.textContent = "Đồng bộ " + GP.timeAgo(s.lastPull); b.title = "Bấm để kéo dữ liệu mới nhất từ Google Sheet";
}

/* ===================== helper giao diện ===================== */
function toast(msg, type) {
  const box = $("#toast");
  box.innerHTML = `<div class="t ${type === true ? "err" : type || ""}">${esc(msg)}</div>`;
  const t = box.firstChild;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), type ? 5000 : 2800);
}
function armed(btn, fn, label = "Bấm lại để xác nhận") {
  if (!btn) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent = btn.dataset.t; fn(); return; }
    btn.dataset.t = btn.textContent; btn.dataset.armed = "1"; btn.classList.add("armed"); btn.textContent = label;
    setTimeout(() => { if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove("armed"); btn.textContent = btn.dataset.t; } }, 3000);
  });
}
function place(pop, btn) {
  const r = btn.getBoundingClientRect();
  pop.classList.add("show");
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let top = r.top - h - 6;
  if (top < 8) top = Math.min(r.bottom + 6, innerHeight - h - 8);
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  pop.style.top = Math.max(8, top) + "px";
}
function closePops() { $$(".pop").forEach((p) => p.classList.remove("show")); }
function openDrawerHTML(html) { $("#drawer").innerHTML = html; $("#ov").classList.add("show"); }
function closeDrawer() { $("#ov").classList.remove("show"); }
function openModalHTML(html, wide) { $("#mdl").className = "mdl" + (wide ? " wide" : ""); $("#mdl").innerHTML = html; $("#mov").classList.add("show"); }
function closeModal() { $("#mov").classList.remove("show"); }
function downloadBlob(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = u; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 8000);
}
const catById = (id) => S.categories.find((c) => c.id === id);
const chipsHTML = (ids) => (ids || []).map(catById).filter(Boolean).map((c) => `<span class="chip" style="--c:${c.color}">${esc(c.name)}</span><span class="dot" style="--c:${c.color}" title="${esc(c.name)}"></span>`).join("");
const gst = (g) => GP.GST[g.status] || GP.GST.khong_xac_dinh;
function allKeywords() {
  const m = new Map();
  for (const g of S.groups) for (const k of g.keywords || []) { const v = m.get(k) || { k, g: 0, p: 0 }; v.g++; m.set(k, v); }
  for (const p of S.posts) for (const k of p.keywords || []) { const v = m.get(k) || { k, g: 0, p: 0 }; v.p++; m.set(k, v); }
  return [...m.values()].sort((a, b) => a.k.localeCompare(b.k, "vi"));
}
function catPicker(el, selected) {
  const set = new Set(selected || []);
  el.classList.add("pick");
  const draw = () => {
    el.innerHTML = S.categories.map((c) => `<span class="chip ${set.has(c.id) ? "on" : ""}" style="--c:${c.color}" data-id="${c.id}">${set.has(c.id) ? "✓ " : ""}${esc(c.name)}</span>`).join("") || `<span class="hint">Chưa có category — thêm ở tab Cài đặt.</span>`;
  };
  el.onclick = (e) => { const b = e.target.closest("[data-id]"); if (!b) return; set.has(b.dataset.id) ? set.delete(b.dataset.id) : set.add(b.dataset.id); draw(); };
  draw();
  return { get: () => S.categories.filter((c) => set.has(c.id)).map((c) => c.id) };
}
function tagInput(el, list, placeholder) {
  let tags = [...(list || [])];
  const dl = "dl" + Math.random().toString(36).slice(2);
  el.classList.add("tags");
  const add = (raw, focus = true) => { String(raw || "").split(",").map(GP.normKw).filter(Boolean).forEach((k) => { if (!tags.includes(k)) tags.push(k); }); draw(focus); };
  const draw = (focus) => {
    el.innerHTML = tags.map((t, i) => `<span class="tag">${esc(t)}<button type="button" data-i="${i}">×</button></span>`).join("") +
      `<input list="${dl}" placeholder="${tags.length ? "" : esc(placeholder || "Gõ từ khóa rồi Enter")}"><datalist id="${dl}">${allKeywords().map((k) => `<option value="${esc(k.k)}">`).join("")}</datalist>`;
    const inp = el.querySelector("input");
    inp.onkeydown = (e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(inp.value); } else if (e.key === "Backspace" && !inp.value && tags.length) { tags.pop(); draw(true); } };
    inp.oninput = (e) => { if ((!e.inputType || e.inputType === "insertReplacementText") && inp.value) add(inp.value); };
    inp.onblur = () => { if (inp.value.trim()) add(inp.value, false); };
    if (focus) inp.focus();
  };
  el.onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b) { tags.splice(+b.dataset.i, 1); draw(true); } else if (e.target === el) el.querySelector("input").focus(); };
  draw(false);
  return { get: () => { const inp = el.querySelector("input"); if (inp && inp.value.trim()) add(inp.value, false); return tags.slice(); } };
}
async function thumbUrl(id) {
  if (thumbCache.has(id)) return thumbCache.get(id);
  const r = await GP.idb.get(id);
  if (!r) return "";
  const u = URL.createObjectURL(r.blob);
  thumbCache.set(id, u);
  return u;
}
function hydrateThumbs(root) { $$("img[data-img]", root).forEach(async (img) => { const u = await thumbUrl(img.dataset.img); if (u) img.src = u; }); }

/* ===================== dữ liệu theo ngày ===================== */
function range() {
  if (UI.mode === "day") { const k = GP.dayKey(UI.day); return { from: k, to: k }; }
  if (UI.mode === "all") return { from: "0000", to: "9999" };
  return { from: GP.dayKey(Date.now() - (UI.mode === "7d" ? 6 : 29) * 864e5), to: GP.dayKey(Date.now()) };
}
const histIn = (r) => S.history.filter((h) => h.date >= r.from && h.date <= r.to);
function statusOf(g, hist) {
  const ls = hist.filter((h) => h.groupId === g.id);
  if (!ls.length) return { st: "todo", n: 0 };
  const n = ls.filter((h) => h.status === "posted").length;
  if (n) return { st: "posted", n };
  if (ls.some((h) => h.status === "review")) return { st: "review", n: 0 };
  return { st: ls.sort((a, b) => b.ts - a.ts)[0].status, n: 0 };
}

/* ===================== TAB GROUP ===================== */
function renderGroupTab() {
  const v = $("#viewGroup");
  if (!$("#gLayout", v)) {
    v.innerHTML = `
    <div class="layout" id="gLayout">
      <aside class="side" id="side"></aside>
      <div class="content">
        <div class="toolbar">
          <input class="inp search" id="gQ" placeholder="Tìm tên, link, từ khóa…">
          <select class="inp" id="gCat"></select>
          <select class="inp" id="gKw"></select>
          <div class="toolbar tb-actions">
            <button class="btn primary" id="gAdd">+ <span class="lbl-full">Thêm group</span></button>
            <button class="btn" id="gPaste" title="Dán nhiều link">⎘ <span class="lbl-full">Dán nhanh</span></button>
            <button class="btn" id="gCsv" data-pop title="Nhập file crawl / Xuất CSV">⇅ <span class="lbl-full">Nhập / Xuất CSV</span></button>
            <button class="btn" id="gScan" title="Mở lần lượt từng group để đọc số thành viên">↻ <span class="lbl-full">Cập nhật thành viên</span></button>
          </div>
        </div>
        <div class="progress" id="prog"><b style="font-size:12px;color:var(--blue2)">↻</b><span class="ptxt" id="pTxt"></span><div class="pbar"><i id="pBar"></i></div><button class="btn sm" id="pStop">Dừng</button></div>
        <div class="tablewrap">
          <div class="thead">
            <input type="checkbox" id="selAll" title="Chọn tất cả">
            <div class="sort" data-s="name">Tên group</div>
            <div class="col-cat">Category</div>
            <div class="col-kw">Từ khóa</div>
            <div class="sort mem" data-s="members" style="text-align:right">Thành viên</div>
            <div class="sort col-added" data-s="added">Ngày thêm</div>
            <div class="sort col-appr" data-s="last">Đăng gần nhất</div>
            <div id="stHead">Hôm nay</div>
            <div class="col-menu"></div>
          </div>
          <div id="rows"></div>
          <div class="foot"><span id="footTxt"></span><span class="sp"></span><span class="lbl-full">Shift + click để chọn nhiều dòng liền nhau</span></div>
        </div>
        <div class="bulk" id="bulk" hidden>
          <span class="count" id="bCount"></span>
          <button class="bb" id="bCat" data-pop>🏷 Category ▾</button>
          <button class="bb" id="bKw" data-pop># Từ khóa ▾</button>
          <button class="bb" id="bScan">↻ Thành viên</button>
          <button class="bb danger" id="bDel">Xoá</button>
          <button class="x" id="bClear">✕ Bỏ chọn</button>
        </div>
      </div>
    </div>`;
    $("#gQ").oninput = (e) => { UI.q = e.target.value; renderGroupBody(); };
    $("#gCat").onchange = (e) => { UI.cat = e.target.value; renderGroupBody(); };
    $("#gKw").onchange = (e) => { UI.kw = e.target.value; renderGroupBody(); };
    $("#gAdd").onclick = () => openGroupDrawer(null);
    $("#gPaste").onclick = openPasteModal;
    $("#gCsv").onclick = (e) => openCsvMenu(e.currentTarget);
    $("#gScan").onclick = () => startScan(UI.sel.size ? [...UI.sel] : UI.list.map((g) => g.id));
    $("#bScan").onclick = () => startScan([...UI.sel]);
    $("#pStop").onclick = () => chrome.runtime.sendMessage({ type: "scanStop" });
    $("#selAll").onchange = (e) => { UI.list.forEach((g) => (e.target.checked ? UI.sel.add(g.id) : UI.sel.delete(g.id))); renderRows(); };
    $$(".thead .sort").forEach((h) => (h.onclick = () => { if (UI.sort === h.dataset.s) UI.dir *= -1; else { UI.sort = h.dataset.s; UI.dir = h.dataset.s === "name" ? 1 : -1; } renderRows(); }));
    $("#bCat").onclick = (e) => { closePops(); drawCatPop(); place($("#popCat"), e.currentTarget); };
    $("#bKw").onclick = (e) => { closePops(); drawKwPop(); place($("#popKw"), e.currentTarget); };
    $("#bClear").onclick = () => { UI.sel.clear(); renderRows(); };
    armed($("#bDel"), async () => {
      const ids = [...UI.sel];
      S.groups = S.groups.filter((g) => !UI.sel.has(g.id));
      UI.sel.clear();
      await commitGroups([], ids);
      toast(`Đã xoá ${ids.length} group`);
      renderGroupBody();
    }, "Bấm lại để xoá");
  }
  renderGroupBody();
}
function renderGroupBody() {
  const kws = allKeywords().filter((k) => k.g);
  $("#gQ").value = UI.q;
  $("#gCat").innerHTML = `<option value="">Mọi category</option>` + S.categories.map((c) => `<option value="${c.id}">${esc(c.name)} (${S.groups.filter((g) => (g.categories || []).includes(c.id)).length})</option>`).join("") + `<option value="__none">Chưa phân loại</option>`;
  $("#gKw").innerHTML = `<option value="">Mọi từ khóa</option>` + kws.map((k) => `<option value="${esc(k.k)}">${esc(k.k)} (${k.g})</option>`).join("");
  $("#gCat").value = UI.cat; $("#gKw").value = UI.kw;
  renderSide();
  renderRows();
  renderScan();
}
function filteredGroups(withStatus = true) {
  const q = UI.q.trim().toLowerCase();
  const hist = histIn(range());
  let list = S.groups.filter((g) => {
    if (UI.cat === "__none" && (g.categories || []).length) return false;
    if (UI.cat && UI.cat !== "__none" && !(g.categories || []).includes(UI.cat)) return false;
    if (UI.kw && !(g.keywords || []).includes(UI.kw)) return false;
    if (q && !(g.name + " " + g.url + " " + (g.keywords || []).join(" ") + " " + (g.note || "")).toLowerCase().includes(q)) return false;
    return true;
  });
  if (withStatus && UI.st) list = list.filter((g) => { const s = statusOf(g, hist).st; return UI.st === "todo" ? s === "todo" : s === UI.st; });
  const lp = (g) => GP.lastPostInGroup(g.id, S.history);
  const key = { name: (g) => g.name.toLowerCase(), members: (g) => +g.members || 0, added: (g) => g.addedAt || 0, last: lp }[UI.sort];
  return list.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * UI.dir);
}
function renderSide() {
  const r = range(), dayMode = UI.mode === "day";
  const selKey = dayMode ? GP.dayKey(UI.day) : "", todayKey = GP.dayKey(Date.now());
  const first = new Date(UI.cal), start = new Date(first); start.setDate(1 - first.getDay());
  const doneDays = new Set(S.history.filter((h) => GP.DONE.includes(h.status)).map((h) => h.date));
  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = GP.dayKey(d);
    cells += `<button class="mc2 ${d.getMonth() !== first.getMonth() ? "out" : ""} ${k === todayKey ? "today" : ""} ${k === selKey ? "sel" : ""} ${!dayMode && k >= r.from && k <= r.to ? "rng" : ""}" data-k="${k}"><span>${d.getDate()}</span><i class="marks">${doneDays.has(k) ? '<b class="m-ok"></b>' : ""}</i></button>`;
  }
  const hist = histIn(r);
  const byPost = new Map();
  hist.forEach((h) => {
    const key = h.postId || h.postTitle || "?";
    if (!byPost.has(key)) byPost.set(key, { title: h.postTitle || "(bài không tên)", postId: h.postId, items: new Map() });
    const m = byPost.get(key), prev = m.items.get(h.groupId);
    if (!prev || h.status === "posted" || (prev.ts < h.ts && prev.status !== "posted")) m.items.set(h.groupId, h);
  });
  const posts = [...byPost.values()].sort((a, b) => b.items.size - a.items.size);
  const base = filteredGroups(false);
  const c = { posted: 0, review: 0, todo: 0 };
  base.forEach((g) => { const s = statusOf(g, hist).st; if (c[s] != null) c[s]++; });
  const title = dayMode ? `${WD_FULL[UI.day.getDay()]}, ${GP.fmtD(UI.day)}/${UI.day.getFullYear()}` : UI.mode === "7d" ? "7 ngày gần nhất" : UI.mode === "30d" ? "30 ngày gần nhất" : "Toàn bộ thời gian";
  const total = posts.reduce((a, p) => a + p.items.size, 0);
  $("#side").innerHTML = `
    <div class="mini">
      <div class="mini-h"><b>Tháng ${first.getMonth() + 1}, ${first.getFullYear()}</b><span class="sp"></span><button class="nb" id="mPrev">⌃</button><button class="nb" id="mNext">⌄</button></div>
      <div class="mini-w">${WD.map((x) => `<span>${x}</span>`).join("")}</div>
      <div class="mini-g">${cells}</div>
      <div class="mini-f">
        <button class="qb ${dayMode && selKey === todayKey ? "on" : ""}" data-q="today">Hôm nay</button>
        <button class="qb ${UI.mode === "7d" ? "on" : ""}" data-q="7d">7 ngày</button>
        <button class="qb ${UI.mode === "30d" ? "on" : ""}" data-q="30d">30 ngày</button>
        <button class="qb ${UI.mode === "all" ? "on" : ""}" data-q="all">Tất cả</button>
      </div>
      <div class="mini-l"><span><b class="m-ok"></b>Có bài đã đăng</span></div>
    </div>
    <div class="dp">
      <div class="dp-h"><div><b>${title}</b><small>${dayMode && selKey === todayKey ? "Hôm nay · " : ""}${posts.length} bài · ${total} lượt group</small></div></div>
      <div class="dstats">
        <button class="ds ok ${UI.st === "posted" ? "on" : ""}" data-st="posted">✓ ${c.posted}</button>
        <button class="ds wait ${UI.st === "review" ? "on" : ""}" data-st="review">⏳ ${c.review}</button>
        <button class="ds todo ${UI.st === "todo" ? "on" : ""}" data-st="todo">○ ${c.todo} chưa đăng</button>
      </div>
      <div class="dp-list">${posts.length ? posts.map((p) => {
        const post = S.posts.find((x) => x.id === p.postId);
        const col = post && post.categories && catById(post.categories[0]) ? catById(post.categories[0]).color : "#64748B";
        const items = [...p.items.values()], L = items.length;
        const n = { posted: items.filter((i) => i.status === "posted").length, review: items.filter((i) => i.status === "review").length };
        const open = UI.open === (p.postId || p.title);
        return `<div class="pc ${open ? "open" : ""}" style="--c:${col}" data-p="${esc(p.postId || p.title)}">
          <div class="pc-h"><div class="pc-t">${esc(p.title)}</div>
            <div class="pc-m">${L} group${n.posted ? ` · <span class="t-ok">${n.posted} đã đăng</span>` : ""}${n.review ? ` · <span class="t-wait">${n.review} chờ duyệt</span>` : ""}</div>
            <div class="seg-bar"><i class="ok" style="width:${n.posted / L * 100}%"></i><i class="wait" style="width:${n.review / L * 100}%"></i></div></div>
          ${open ? `<div class="pc-b">${items.map((it) => { const st = GP.STATUS[it.status] || { cls: "skip", label: it.status }; return `<div class="pg"><span class="t">${esc(it.groupName || (S.groups.find((g) => g.id === it.groupId) || {}).name || it.groupId)}</span>${it.user ? `<span class="dim" style="font-size:10.5px">${esc(it.user)}</span>` : ""}<span class="badge ${st.cls}">${st.label}</span></div>`; }).join("")}</div>` : ""}
        </div>`;
      }).join("") : `<div class="dp-empty">Chưa có bài nào được đăng${dayMode ? " trong ngày này" : ""}.</div>`}</div>
    </div>`;
  $("#mPrev").onclick = () => { UI.cal = new Date(UI.cal.getFullYear(), UI.cal.getMonth() - 1, 1); renderSide(); };
  $("#mNext").onclick = () => { UI.cal = new Date(UI.cal.getFullYear(), UI.cal.getMonth() + 1, 1); renderSide(); };
  $$(".mc2").forEach((b) => (b.onclick = () => { const [y, m, d] = b.dataset.k.split("-").map(Number); UI.mode = "day"; UI.day = new Date(y, m - 1, d); UI.open = null; if (m - 1 !== UI.cal.getMonth()) UI.cal = new Date(y, m - 1, 1); renderSide(); renderRows(); }));
  $$(".mini-f .qb").forEach((b) => (b.onclick = () => { if (b.dataset.q === "today") { UI.mode = "day"; UI.day = today0(); UI.cal = new Date(UI.day.getFullYear(), UI.day.getMonth(), 1); } else UI.mode = b.dataset.q; UI.open = null; renderSide(); renderRows(); }));
  $$("#side .ds").forEach((b) => (b.onclick = () => { UI.st = UI.st === b.dataset.st ? "" : b.dataset.st; renderSide(); renderRows(); }));
  $$(".pc").forEach((pc) => (pc.onclick = (e) => { if (e.target.closest(".pc-b")) return; UI.open = UI.open === pc.dataset.p ? null : pc.dataset.p; renderSide(); }));
}
function renderRows() {
  const list = filteredGroups();
  UI.list = list;
  for (const id of [...UI.sel]) if (!S.groups.some((g) => g.id === id)) UI.sel.delete(id);
  const hist = histIn(range());
  const dayMode = UI.mode === "day", todayKey = GP.dayKey(Date.now());
  $("#stHead").textContent = dayMode ? (GP.dayKey(UI.day) === todayKey ? "Hôm nay" : "Ngày " + GP.fmtD(UI.day)) : "Trong kỳ";
  $$(".thead .sort").forEach((h) => { h.dataset.label = h.dataset.label || h.textContent; const lab = document.body.classList.contains("narrow") && h.dataset.s === "members" ? "TV" : h.dataset.label; h.textContent = lab + (h.dataset.s === UI.sort ? (UI.dir > 0 ? " ↑" : " ↓") : ""); h.classList.toggle("on", h.dataset.s === UI.sort); });
  $("#rows").innerHTML = list.length ? list.map((g, i) => {
    const s = statusOf(g, hist), lp = GP.lastPostInGroup(g.id, S.history), gs = gst(g);
    const fresh = g.memUpd && Date.now() - g.memUpd < 36 * 3600e3;
    let stCell;
    if (s.st === "todo") stCell = `<span class="badge todo">Chưa đăng</span>`;
    else if (!dayMode && s.n) stCell = `<span class="badge ok">${s.n} lần đăng</span>`;
    else { const st = GP.STATUS[s.st] || { cls: "skip", label: s.st }; stCell = `<span class="badge ${st.cls}">${st.label}</span>`; }
    return `<div class="tr ${UI.sel.has(g.id) ? "sel" : ""}" data-id="${g.id}" data-i="${i}">
      <input type="checkbox" class="rs" ${UI.sel.has(g.id) ? "checked" : ""}>
      <div class="cell name"><span class="gdot" style="background:${gs.dot}" title="${gs.label}"></span><span class="t" title="${esc(g.name)}">${esc(g.name)}</span>${g.approval ? `<span class="appr" title="Group duyệt bài">DUYỆT</span>` : ""}<a href="${esc(g.url)}" target="_blank" title="Mở group">↗</a></div>
      <div class="cell col-cat"><div class="chips">${chipsHTML(g.categories) || '<span class="dim" style="font-size:11px">—</span>'}</div></div>
      <div class="cell col-kw"><div class="chips">${(g.keywords || []).slice(0, 2).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}${(g.keywords || []).length > 2 ? `<span class="more">+${g.keywords.length - 2}</span>` : ""}</div></div>
      <div class="cell mem ${fresh ? "upd" : ""}"><b>${GP.fmtN(g.members)}</b><small>${g.memUpd ? GP.timeAgo(g.memUpd) : "chưa cập nhật"}</small></div>
      <div class="cell col-added dim">${g.addedAt ? GP.fmtD(g.addedAt) + "/" + String(new Date(g.addedAt).getFullYear()).slice(2) : "—"}</div>
      <div class="cell col-appr dim">${lp ? GP.timeAgo(lp) : "—"}</div>
      <div class="cell">${stCell}</div>
      <div class="col-menu"><button class="menu-btn" data-pop title="Thao tác">⋯</button></div>
    </div>`;
  }).join("") : `<div class="empty"><b>${S.groups.length ? "Không có group khớp bộ lọc" : "Chưa có group nào"}</b>${S.groups.length ? "Thử đổi ngày, category hoặc từ khóa." : "Bấm “+ Thêm group”, “Dán nhanh” hoặc Nhập file crawl."}</div>`;
  $("#footTxt").textContent = `${list.length} / ${S.groups.length} group`;
  const allSel = list.length && list.every((g) => UI.sel.has(g.id));
  $("#selAll").checked = !!allSel;
  $("#selAll").indeterminate = !allSel && list.some((g) => UI.sel.has(g.id));
  $$("#rows .tr").forEach((row) => {
    const id = row.dataset.id, i = +row.dataset.i;
    row.onclick = (e) => {
      if (e.target.closest("a")) return;
      if (e.target.closest(".menu-btn")) { openRowMenu(e.target.closest(".menu-btn"), id); return; }
      if (e.target.classList.contains("rs")) { toggleSel(i, e.shiftKey, e.target.checked); return; }
      openGroupDrawer(S.groups.find((g) => g.id === id));
    };
  });
  $("#bulk").hidden = !UI.sel.size;
  $("#bCount").textContent = `Đã chọn ${UI.sel.size}`;
}
function toggleSel(i, shift, on) {
  if (shift && UI.lastIdx != null) { const [a, b] = [Math.min(UI.lastIdx, i), Math.max(UI.lastIdx, i)]; for (let k = a; k <= b; k++) on ? UI.sel.add(UI.list[k].id) : UI.sel.delete(UI.list[k].id); }
  else on ? UI.sel.add(UI.list[i].id) : UI.sel.delete(UI.list[i].id);
  UI.lastIdx = i;
  renderRows();
}
const selGroups = () => S.groups.filter((g) => UI.sel.has(g.id));
function drawCatPop() {
  const sg = selGroups(), n = sg.length;
  $("#popCat").innerHTML = `<h4>Category cho ${n} group</h4>` + S.categories.map((c) => {
    const k = sg.filter((g) => (g.categories || []).includes(c.id)).length, st = k === n ? "all" : k ? "some" : "";
    return `<div class="opt" data-c="${c.id}"><span class="tri ${st}">${st === "all" ? "✓" : st === "some" ? "–" : ""}</span><span class="dot" style="--c:${c.color};display:inline-block"></span>${esc(c.name)}<span class="n">${k}/${n}</span></div>`;
  }).join("") + `<div class="hint">Bấm 1 lần để gán cho tất cả · bấm lại để bỏ khỏi tất cả</div>`;
  $$("#popCat .opt").forEach((o) => (o.onclick = async () => {
    const id = o.dataset.c, all = sg.every((g) => (g.categories || []).includes(id));
    sg.forEach((g) => { g.categories = all ? (g.categories || []).filter((x) => x !== id) : [...new Set([...(g.categories || []), id])]; g.updatedAt = Date.now(); });
    await commitGroups(sg);
    toast(all ? `Đã bỏ “${catById(id).name}” khỏi ${n} group` : `Đã gán “${catById(id).name}” cho ${n} group`);
    drawCatPop(); renderGroupBody();
  }));
}
function drawKwPop() {
  const sg = selGroups(), n = sg.length, counts = new Map();
  sg.forEach((g) => (g.keywords || []).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
  const list = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  $("#popKw").innerHTML = `<h4>Từ khóa cho ${n} group</h4>
    <div class="addrow"><input class="inp" id="kwNew" placeholder="Thêm từ khóa, Enter…"><button class="btn sm primary" id="kwAdd">Thêm</button></div>
    <div style="max-height:220px;overflow:auto">${list.map(([k, c]) => `<div class="opt" data-k="${esc(k)}"><span class="tri ${c === n ? "all" : "some"}">${c === n ? "✓" : "–"}</span>${esc(k)}<span class="n" style="margin-left:auto">${c}/${n}</span><button class="rm" title="Bỏ khỏi tất cả">✕</button></div>`).join("") || `<div class="hint" style="border:0">Chưa có từ khóa</div>`}</div>
    <div class="hint">Bấm từ khóa để gán cho tất cả · ✕ để bỏ khỏi tất cả</div>`;
  const apply = async (fn, msg) => { sg.forEach((g) => { fn(g); g.updatedAt = Date.now(); }); await commitGroups(sg); toast(msg); drawKwPop(); renderGroupBody(); };
  const add = () => { const v = $("#kwNew").value.split(",").map(GP.normKw).filter(Boolean); if (v.length) apply((g) => { g.keywords = [...new Set([...(g.keywords || []), ...v])]; }, `Đã thêm ${v.join(", ")} cho ${n} group`).then(() => $("#kwNew") && $("#kwNew").focus()); };
  $("#kwAdd").onclick = add;
  $("#kwNew").onkeydown = (e) => { if (e.key === "Enter") add(); };
  $$("#popKw .opt").forEach((o) => (o.onclick = (e) => {
    const k = o.dataset.k;
    if (e.target.classList.contains("rm")) apply((g) => { g.keywords = (g.keywords || []).filter((x) => x !== k); }, `Đã bỏ “${k}” khỏi ${n} group`);
    else apply((g) => { g.keywords = [...new Set([...(g.keywords || []), k])]; }, `Đã gán “${k}” cho ${n} group`);
  }));
  setTimeout(() => $("#kwNew") && $("#kwNew").focus(), 0);
}
function openRowMenu(btn, id) {
  const g = S.groups.find((x) => x.id === id);
  closePops();
  $("#popMenu").innerHTML = `<div class="opt" data-a="edit">✎ Sửa group</div><div class="opt" data-a="open">↗ Mở group</div><div class="opt" data-a="scan">↻ Cập nhật thành viên</div><div class="opt" data-a="del" style="color:#B91C1C">🗑 Xoá</div>`;
  place($("#popMenu"), btn);
  $$("#popMenu .opt").forEach((o) => (o.onclick = async () => {
    closePops();
    if (o.dataset.a === "edit") openGroupDrawer(g);
    if (o.dataset.a === "open") chrome.tabs.create({ url: g.url });
    if (o.dataset.a === "scan") startScan([g.id]);
    if (o.dataset.a === "del") { S.groups = S.groups.filter((x) => x.id !== id); await commitGroups([], [id]); toast(`Đã xoá “${g.name}”`); renderGroupBody(); }
  }));
}
async function startScan(ids) {
  if (!ids.length) return;
  if (S.scan) { toast("Đang cập nhật, bấm Dừng trước khi chạy lượt mới.", "warn"); return; }
  await chrome.runtime.sendMessage({ type: "scanStart", ids });
  toast(`Bắt đầu cập nhật ${ids.length} group (mỗi group ~5 giây, chạy ở tab nền)`);
}
function renderScan() {
  const p = $("#prog");
  if (!p) return;
  const sc = S.scan;
  p.classList.toggle("show", !!sc);
  if (!sc) return;
  const g = S.groups.find((x) => x.id === sc.ids[sc.idx]);
  $("#pTxt").textContent = `Đang đọc ${Math.max(sc.idx + 1, 1)}/${sc.ids.length}${g ? " · " + g.name : ""}`;
  $("#pBar").style.width = ((sc.idx + 1) / sc.ids.length * 100) + "%";
}

/* ---------- drawer thêm / sửa group ---------- */
function openGroupDrawer(g) {
  const isNew = !g;
  const d = g ? JSON.parse(JSON.stringify(g)) : { id: GP.uid("g_"), name: "", url: "", categories: UI.cat && UI.cat !== "__none" ? [UI.cat] : [], keywords: [], members: 0, approval: null, status: "", rules: "", note: "" };
  const hist = S.history.filter((h) => h.groupId === d.id).sort((a, b) => b.ts - a.ts).slice(0, 10);
  openDrawerHTML(`
    <div class="dr-h"><b>${isNew ? "Thêm group" : "Sửa group"}</b><button id="drX">✕</button></div>
    <div class="dr-b">
      <label class="lbl">Link group *</label><input class="inp" id="fUrl" value="${esc(d.url)}" placeholder="https://www.facebook.com/groups/…">
      <label class="lbl">Tên group *</label><input class="inp" id="fName" value="${esc(d.name)}">
      <label class="lbl">Category</label><div id="fCats"></div>
      <label class="lbl">Từ khóa <span class="hint">Enter để thêm</span></label><div id="fKw"></div>
      <label class="lbl">Thành viên</label>
      <div class="memcard">
        <div><b>${d.members ? (+d.members).toLocaleString("vi-VN") : "—"}</b><small>${d.memUpd ? "Tự cập nhật khi mở group · lần cuối " + GP.timeAgo(d.memUpd) : "Tự cập nhật khi bạn mở group này"}</small></div>
        <span class="sp"></span>${isNew ? "" : `<button class="btn sm" id="fScan">↻ Cập nhật</button>`}
      </div>
      <div class="grid2" style="margin-top:4px">
        <div><label class="lbl">Tình trạng</label><select class="inp" id="fSt">${Object.entries(GP.GST).map(([k, v]) => `<option value="${k}" ${d.status === k ? "selected" : ""}>${v.label}</option>`).join("")}</select></div>
        <div><label class="lbl">Duyệt bài</label><select class="inp" id="fAppr"><option value="">Chưa rõ</option><option value="co" ${d.approval === true ? "selected" : ""}>Có duyệt</option><option value="khong" ${d.approval === false ? "selected" : ""}>Không duyệt</option></select></div>
      </div>
      <label class="lbl">Luật group</label><textarea class="inp" id="fRules" rows="2">${esc(d.rules)}</textarea>
      <label class="lbl">Ghi chú</label><textarea class="inp" id="fNote" rows="2">${esc(d.note)}</textarea>
      ${isNew ? "" : `<label class="lbl">Lịch sử đăng</label><div class="hist">${hist.length ? hist.map((h) => { const st = GP.STATUS[h.status] || { cls: "skip", label: h.status }; const dt = new Date(h.ts); return `<div class="hrow"><span class="d">${WD[dt.getDay()]} ${GP.fmtD(dt)}</span><span class="p">${esc(h.postTitle || "")}${h.user ? " · " + esc(h.user) : ""}</span><span class="badge ${st.cls}">${st.label}</span></div>`; }).join("") : `<span class="dim">Chưa đăng lần nào</span>`}</div>`}
      <div class="err-t" id="fErr"></div>
    </div>
    <div class="dr-f">${isNew ? "" : `<button class="btn danger" id="fDel">Xoá</button>`}<span class="sp"></span><button class="btn" id="drC">Huỷ</button><button class="btn primary" id="fSave">Lưu</button></div>`);
  const cats = catPicker($("#fCats"), d.categories);
  const kws = tagInput($("#fKw"), d.keywords);
  $("#drX").onclick = $("#drC").onclick = closeDrawer;
  $("#fUrl").onchange = () => { const n = GP.normalizeGroupUrl($("#fUrl").value); if (n) { $("#fUrl").value = n.url; if (!$("#fName").value.trim()) $("#fName").value = GP.nameFromSlug(n.slug); } };
  if ($("#fScan")) $("#fScan").onclick = () => { closeDrawer(); startScan([d.id]); };
  (isNew ? $("#fUrl") : $("#fName")).focus();
  $("#fSave").onclick = async () => {
    const n = GP.normalizeGroupUrl($("#fUrl").value);
    if (!n) { $("#fErr").textContent = "Link chưa đúng dạng facebook.com/groups/…"; return; }
    const dup = S.groups.find((x) => x.id !== d.id && GP.groupKey(x.url) === n.key);
    if (dup) { $("#fErr").textContent = `Link này đã có: “${dup.name}”.`; return; }
    const a = $("#fAppr").value;
    Object.assign(d, { url: n.url, name: $("#fName").value.trim() || GP.nameFromSlug(n.slug), categories: cats.get(), keywords: kws.get(), status: $("#fSt").value, approval: a === "co" ? true : a === "khong" ? false : null, rules: $("#fRules").value.trim(), note: $("#fNote").value.trim(), updatedAt: Date.now() });
    if (isNew) { d.addedAt = Date.now(); S.groups.push(d); } else S.groups = S.groups.map((x) => (x.id === d.id ? d : x));
    await commitGroups([d]);
    closeDrawer();
    toast(isNew ? `Đã thêm “${d.name}”` : `Đã lưu “${d.name}”`);
    renderView();
  };
  armed($("#fDel"), async () => { S.groups = S.groups.filter((x) => x.id !== d.id); await commitGroups([], [d.id]); closeDrawer(); toast(`Đã xoá “${d.name}”`); renderView(); }, "Bấm lại để xoá");
}

/* ---------- dán nhanh ---------- */
function openPasteModal() {
  openModalHTML(`
    <div class="dr-h"><b>Dán nhanh nhiều group</b><button id="qX">✕</button></div>
    <div class="dr-b">
      <p class="hint" style="margin:0 0 6px">Mỗi dòng một group: <code>link</code> hoặc <code>Tên group | link</code>. Link đã có sẽ được bỏ qua.</p>
      <textarea class="inp" id="qText" rows="8" style="width:100%" placeholder="Hội chủ shop điện thoại HCM | https://www.facebook.com/groups/abc"></textarea>
      <label class="lbl">Cho vào category nào?</label><div id="qCats"></div>
      <label class="lbl">Từ khóa cho tất cả</label><div id="qKw"></div>
      <div class="err-t" id="qErr"></div>
    </div>
    <div class="dr-f"><span class="sp"></span><button class="btn" id="qC">Huỷ</button><button class="btn primary" id="qGo">Thêm vào danh sách</button></div>`);
  const cats = catPicker($("#qCats"), UI.cat && UI.cat !== "__none" ? [UI.cat] : []);
  const kws = tagInput($("#qKw"), []);
  $("#qX").onclick = $("#qC").onclick = closeModal;
  $("#qText").focus();
  $("#qGo").onclick = async () => {
    const lines = $("#qText").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { $("#qErr").textContent = "Chưa có dòng nào."; return; }
    const catIds = cats.get(), kw = kws.get(), added = [];
    let dup = 0, bad = 0;
    for (const l of lines) {
      const parts = l.split(/\s*[|\t]\s*/).filter(Boolean);
      const url = parts.find((p) => /facebook\.com|fb\.com/i.test(p)) || parts[parts.length - 1];
      const n = GP.normalizeGroupUrl(url);
      if (!n) { bad++; continue; }
      if (S.groups.some((g) => GP.groupKey(g.url) === n.key) || added.some((g) => GP.groupKey(g.url) === n.key)) { dup++; continue; }
      const name = parts.filter((p) => p !== url).join(" ").trim();
      added.push({ id: GP.uid("g_"), url: n.url, name: name || GP.nameFromSlug(n.slug), categories: catIds, keywords: kw, members: 0, status: "", approval: null, rules: "", note: "", addedAt: Date.now(), updatedAt: Date.now() });
    }
    S.groups.push(...added);
    await commitGroups(added);
    closeModal();
    toast(`Thêm ${added.length}${dup ? ` · bỏ qua ${dup} trùng` : ""}${bad ? ` · ${bad} dòng sai link` : ""}`, bad ? "warn" : "");
    renderGroupBody();
  };
}

/* ---------- nhập file crawl / xuất CSV ---------- */
function openCsvMenu(btn) {
  closePops();
  $("#popMenu").innerHTML = `<div class="opt" data-a="file">⬆ Nhập file crawl (.csv)…</div><div class="opt" data-a="export">⬇ Xuất CSV toàn bộ group</div><div class="opt" data-a="tpl">📄 Tải file CSV mẫu</div>`;
  place($("#popMenu"), btn);
  $$("#popMenu .opt").forEach((o) => (o.onclick = () => {
    closePops();
    if (o.dataset.a === "file") { $("#csvFile").value = ""; $("#csvFile").click(); }
    if (o.dataset.a === "export") exportCSV();
    if (o.dataset.a === "tpl") downloadBlob(new Blob([GP.toCSV([["ten", "link", "thanh_vien", "quyen_rieng_tu", "tinh_trang", "duyet_bai", "tu_khoa", "bai_moi_ngay", "ngay_crawl", "ghi_chu"], ["Hội Thợ Sửa Điện Thoại Sài Gòn", "https://www.facebook.com/groups/thosuadtsg/", "48200", "cong_khai", "san_sang", "co", "sửa chữa; điện thoại; tp hcm", "25", GP.dayKey(Date.now()), ""]])], { type: "text/csv" }), "group-crawl-mau.csv");
  }));
}
$("#csvFile").onchange = async (e) => { const f = e.target.files[0]; if (f) openImport(await f.text(), f.name); };
const HEAD = {
  name: ["ten", "tên", "name", "ten group", "tên group"], url: ["link", "url"],
  categories: ["category", "categories", "danh muc", "danh mục"], keywords: ["tu khoa", "từ khóa", "từ khoá", "keywords", "keyword"],
  members: ["thanh vien", "thành viên", "members"], privacy: ["quyen rieng tu", "quyền riêng tư", "privacy"],
  status: ["tinh trang", "tình trạng", "status"], approval: ["duyet bai", "duyệt bài", "approval"],
  perDay: ["bai moi ngay"], rules: ["luat", "luật", "rules"], note: ["ghi chu", "ghi chú", "note"]
};
function openImport(text, fileName) {
  const rows = GP.parseCSV(text);
  if (rows.length < 2) { toast("File trống hoặc thiếu dòng tiêu đề.", true); return; }
  const head = rows[0].map((h) => h.trim().toLowerCase().replace(/_/g, " "));
  const idx = {};
  for (const [f, names] of Object.entries(HEAD)) idx[f] = head.findIndex((h) => names.includes(h));
  if (idx.url < 0) { toast("Không thấy cột “link” trong file.", true); return; }
  const get = (r, f) => (idx[f] >= 0 && r[idx[f]] != null ? String(r[idx[f]]).trim() : "");
  const recs = [];
  rows.slice(1).forEach((r, i) => {
    const n = GP.normalizeGroupUrl(get(r, "url"));
    if (!n) return;
    const ex = S.groups.find((g) => GP.groupKey(g.url) === n.key);
    const ap = get(r, "approval");
    recs.push({
      i: recs.length, url: n.url, name: get(r, "name") || GP.nameFromSlug(n.slug), members: GP.parseCount(get(r, "members")) || 0,
      privacy: get(r, "privacy"), status: GP.GST[get(r, "status")] ? get(r, "status") : "", approval: /^(co|có|1|x|yes|true)$/i.test(ap) ? true : /^(khong|không|0|no|false)$/i.test(ap) ? false : null,
      kws: get(r, "keywords").split(/[;|,]/).map(GP.normKw).filter(Boolean), catNames: GP.splitMulti(get(r, "categories")),
      perDay: get(r, "perDay"), rules: get(r, "rules"), note: get(r, "note"), dup: ex ? ex.id : null, cats: new Set()
    });
  });
  if (!recs.length) { toast("Không có dòng nào có link group hợp lệ.", true); return; }
  const hasCatCol = recs.some((r) => r.catNames.length);
  const O = { mode: hasCatCol ? "file" : "all", cats: new Set(), skipDead: true, onlyReady: false, updateDup: true };
  const included = (r) => !(O.skipDead && r.status === "link_loi") && !(O.onlyReady && r.status && r.status !== "san_sang");
  const draw = () => {
    const inc = recs.filter(included);
    const needCat = O.mode === "all" ? !O.cats.size : O.mode === "row" ? inc.some((r) => !r.cats.size) : false;
    const nNew = inc.filter((r) => !r.dup).length, nDup = inc.length - nNew;
    const stCount = Object.keys(GP.GST).map((k) => [k, recs.filter((r) => (r.status || "khong_xac_dinh") === k).length]).filter(([, n]) => n);
    openModalHTML(`
      <div class="dr-h"><b>Nhập group từ file</b><span class="dim" style="margin-left:8px">${esc(fileName)} · ${recs.length} dòng</span><button id="iX">✕</button></div>
      <div class="dr-b">
        <div class="imp-q">
          <div class="imp-qt">① Cho các group này vào category nào? <span class="req">bắt buộc</span></div>
          <div class="seg2" style="margin:6px 0 8px"><button data-m="all" class="${O.mode === "all" ? "on" : ""}">Cùng category cho tất cả</button><button data-m="row" class="${O.mode === "row" ? "on" : ""}">Chọn theo từng dòng</button>${hasCatCol ? `<button data-m="file" class="${O.mode === "file" ? "on" : ""}">Theo cột category trong file</button>` : ""}</div>
          ${O.mode === "all" ? `<div class="catpick" id="iCats">${S.categories.map((c) => `<span class="chip ${O.cats.has(c.id) ? "on" : ""}" style="--c:${c.color}" data-c="${c.id}">${O.cats.has(c.id) ? "✓ " : ""}${esc(c.name)}</span>`).join("")}</div>` : O.mode === "row" ? `<div class="note" style="margin:0">Bấm chấm màu ở cột Category của từng dòng.</div>` : `<div class="note" style="margin:0">Dùng tên category ghi trong file (tự tạo category mới nếu chưa có).</div>`}
        </div>
        <div class="imp-q">
          <div class="imp-qt">② Tuỳ chọn</div>
          <div class="imp-opts">
            <label class="check"><input type="checkbox" id="oDead" ${O.skipDead ? "checked" : ""}> Bỏ qua link lỗi</label>
            <label class="check"><input type="checkbox" id="oReady" ${O.onlyReady ? "checked" : ""}> Chỉ nhập group “Sẵn sàng đăng”</label>
            <label class="check"><input type="checkbox" id="oDup" ${O.updateDup ? "checked" : ""}> Group đã có: cập nhật thành viên &amp; gộp từ khóa</label>
          </div>
          <div class="imp-sum">${stCount.map(([k, n]) => `<span><i style="background:${GP.GST[k].dot}"></i>${GP.GST[k].label} ${n}</span>`).join("")}</div>
        </div>
        <div class="imp-tbl">
          <div class="ih"><span></span><span>Group</span><span style="text-align:right">Thành viên</span><span>Từ khóa</span><span>Category</span></div>
          ${recs.map((r) => {
            const g = GP.GST[r.status] || GP.GST.khong_xac_dinh;
            const catCell = O.mode === "all" ? (O.cats.size ? [...O.cats].map((id) => `<span class="chip" style="--c:${catById(id).color}">${esc(catById(id).name)}</span>`).join("") : `<span class="dim" style="font-size:11px">chưa chọn</span>`)
              : O.mode === "row" ? S.categories.map((c) => `<button class="cdot ${r.cats.has(c.id) ? "on" : ""}" style="--c:${c.color}" data-c="${c.id}" title="${esc(c.name)}"></button>`).join("")
              : (r.catNames.map((n) => `<span class="kw">${esc(n)}</span>`).join("") || `<span class="dim" style="font-size:11px">—</span>`);
            return `<div class="ir ${included(r) ? "" : "off"}" data-i="${r.i}">
              <span class="gdot" style="background:${g.dot}" title="${g.label}"></span>
              <span class="cell"><b>${esc(r.name)}</b> ${r.dup ? `<span class="tagdup">đã có</span>` : `<span class="tagnew">mới</span>`}<small>${g.label}${r.privacy === "rieng_tu" ? " · riêng tư" : r.privacy === "cong_khai" ? " · công khai" : ""}${r.perDay ? ` · ~${esc(r.perDay)} bài/ngày` : ""}${r.note ? " · " + esc(r.note) : ""}</small></span>
              <span class="mem"><b>${GP.fmtN(r.members)}</b></span>
              <span class="chips">${r.kws.slice(0, 3).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}${r.kws.length > 3 ? `<span class="more">+${r.kws.length - 3}</span>` : ""}</span>
              <span class="rc">${catCell}</span>
            </div>`;
          }).join("")}
        </div>
      </div>
      <div class="dr-f"><span class="dim">${inc.length} group sẽ nhập · ${nNew} mới${nDup ? ` · ${nDup} đã có${O.updateDup ? " (cập nhật)" : " (bỏ qua)"}` : ""}</span><span class="sp"></span>${needCat ? `<span class="warn-t">Chọn category trước khi nhập</span>` : ""}<button class="btn" id="iC">Huỷ</button><button class="btn primary" id="iOk" ${needCat || !inc.length ? "disabled" : ""}>Nhập ${inc.length} group</button></div>`, true);
    $("#iX").onclick = $("#iC").onclick = closeModal;
    $$("#mdl .seg2 button").forEach((b) => (b.onclick = () => { O.mode = b.dataset.m; draw(); }));
    $$("#iCats .chip").forEach((ch) => (ch.onclick = () => { O.cats.has(ch.dataset.c) ? O.cats.delete(ch.dataset.c) : O.cats.add(ch.dataset.c); draw(); }));
    $("#oDead").onchange = (e) => { O.skipDead = e.target.checked; draw(); };
    $("#oReady").onchange = (e) => { O.onlyReady = e.target.checked; draw(); };
    $("#oDup").onchange = (e) => { O.updateDup = e.target.checked; draw(); };
    $$("#mdl .cdot").forEach((b) => (b.onclick = () => { const r = recs[+b.closest(".ir").dataset.i]; r.cats.has(b.dataset.c) ? r.cats.delete(b.dataset.c) : r.cats.add(b.dataset.c); draw(); }));
    $("#iOk").onclick = async () => {
      const changed = [], newCats = [];
      let added = 0, upd = 0;
      for (const r of inc) {
        let cats;
        if (O.mode === "all") cats = [...O.cats];
        else if (O.mode === "row") cats = [...r.cats];
        else cats = r.catNames.map((name) => {
          let c = S.categories.find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (!c) { c = { id: GP.uid("cat_"), name, color: GP.PALETTE[S.categories.length % GP.PALETTE.length] }; S.categories.push(c); newCats.push(c); }
          return c.id;
        });
        if (r.dup) {
          if (!O.updateDup) continue;
          const g = S.groups.find((x) => x.id === r.dup);
          if (r.members) { g.members = r.members; g.memUpd = Date.now(); }
          g.keywords = [...new Set([...(g.keywords || []), ...r.kws])];
          g.categories = [...new Set([...(g.categories || []), ...cats])];
          if (r.status) g.status = r.status;
          if (r.privacy) g.privacy = r.privacy;
          if (r.approval != null) g.approval = r.approval;
          g.updatedAt = Date.now();
          changed.push(g); upd++;
        } else {
          const g = { id: GP.uid("g_"), name: r.name, url: r.url, categories: cats, keywords: r.kws, members: r.members, memUpd: r.members ? Date.now() : 0, privacy: r.privacy, status: r.status, approval: r.approval, rules: r.rules, note: r.note, addedAt: Date.now(), updatedAt: Date.now() };
          S.groups.push(g); changed.push(g); added++;
        }
      }
      if (newCats.length) await commitCategories(newCats);
      await commitGroups(changed);
      closeModal();
      UI.sort = "added"; UI.dir = -1;
      toast(`Đã nhập ${added} group mới${upd ? ` · cập nhật ${upd}` : ""}`);
      renderGroupBody();
    };
  };
  draw();
}
function exportCSV() {
  const rows = [["ten", "link", "category", "tu_khoa", "thanh_vien", "quyen_rieng_tu", "tinh_trang", "duyet_bai", "luat", "ghi_chu"]];
  for (const g of S.groups) { const r = GP.groupToRow(g, S.categories); rows.push([r.ten, r.link, r.category, r.tu_khoa, r.thanh_vien, r.quyen_rieng_tu, r.tinh_trang, r.duyet_bai, r.luat, r.ghi_chu]); }
  downloadBlob(new Blob([GP.toCSV(rows)], { type: "text/csv;charset=utf-8" }), `group-poster-groups-${GP.dayKey(Date.now())}.csv`);
  toast(`Đã xuất ${S.groups.length} group`);
}

/* ===================== TAB ĐĂNG BÀI ===================== */
const curPost = () => S.posts.find((p) => p.id === UI.pi) || S.posts[0];
function queueRows(p) {
  let rows = S.groups.map((g) => ({ g, kw: (g.keywords || []).filter((k) => (p.keywords || []).includes(k)).length, log: S.logs[p.id + "|" + g.id], last: GP.lastPostInGroup(g.id, S.history) }));
  if (!UI.allCat && (p.categories || []).length) rows = rows.filter((r) => (r.g.categories || []).some((c) => p.categories.includes(c)));
  return rows;
}
function queueFiltered(p) {
  let rows = queueRows(p);
  if (UI.hideNotReady) rows = rows.filter((r) => !["cho_duyet_tham_gia", "chua_tham_gia", "link_loi"].includes(r.g.status));
  const q = UI.pq.trim().toLowerCase();
  if (q) rows = rows.filter((r) => (r.g.name + " " + (r.g.keywords || []).join(" ")).toLowerCase().includes(q));
  const dn = (r) => (r.log && ["posted", "review"].includes(r.log.status) ? 1 : 0);
  return rows.sort((a, b) => dn(a) - dn(b) || b.kw - a.kw || (+b.g.members || 0) - (+a.g.members || 0));
}
function renderPostTab() {
  const v = $("#viewPost");
  if (!S.posts.length) {
    v.innerHTML = `<div class="empty empty-card"><b>Chưa có bài đăng</b>Soạn bài (chữ + nhiều ảnh) ở tab Nội dung trước.<br><button class="btn primary" id="goNew" style="margin-top:12px">+ Soạn bài đầu tiên</button></div>`;
    $("#goNew").onclick = () => { showView("content"); startEdit(null); };
    return;
  }
  if (!S.groups.length) {
    v.innerHTML = `<div class="empty empty-card"><b>Chưa có group</b>Thêm group ở tab Group, hoặc kết nối Google Sheet ở tab Cài đặt.<br><button class="btn primary" id="goG" style="margin-top:12px">Sang tab Group</button></div>`;
    $("#goG").onclick = () => showView("group");
    return;
  }
  const p = curPost();
  UI.pi = p.id;
  const vs = GP.variants(p);
  if (UI.pv >= vs.length) UI.pv = 0;
  const base = queueRows(p);
  const cnt = (s) => base.filter((r) => r.log && r.log.status === s).length;
  const rows = queueFiltered(p);
  const todo = rows.filter((r) => !r.log || !["posted", "review"].includes(r.log.status)).length;
  const user = S.settings.userName;
  const la = GP.lastPostAny(S.history, user), mins = la ? Math.floor((Date.now() - la) / 60000) : null;
  const tc = GP.todayCount(S.history, user);
  const doneCount = (x) => Object.keys(S.logs).filter((k) => k.startsWith(x.id + "|") && GP.DONE.includes(S.logs[k].status)).length;
  const spinMark = (t) => esc(t).replace(/\{([^{}]*\|[^{}]*)\}/g, (_, b) => `<span class="spin" title="Tự đổi mỗi lần đăng">${b.split("|").join(" / ")}</span>`);
  v.innerHTML = `
  <div class="pl">
    <aside class="pside">
      <div class="card2">
        <div class="c2h"><b>Chọn bài đăng</b><button class="btn sm" id="pNew">+ Bài mới</button></div>
        <div class="plist">${S.posts.map((x) => { const c = catById((x.categories || [])[0]); return `<button class="pitem ${x.id === p.id ? "on" : ""}" data-id="${x.id}" style="--c:${c ? c.color : "#64748B"}">
          ${(x.imageIds || []).length ? `<img data-img="${x.imageIds[0]}" alt="">` : `<img alt="">`}<span><b>${esc(x.title || "(chưa đặt tên)")}</b><small>${c ? esc(c.name) + " · " : ""}${GP.variants(x).length} phiên bản · ${(x.imageIds || []).length} ảnh · đã lên ${doneCount(x)} group</small></span></button>`; }).join("")}</div>
      </div>
      <div class="card2">
        <div class="c2h"><b>Xem trước</b>${vs.length > 1 ? `<span class="seg2">${vs.map((_, i) => `<button data-v="${i}" class="${i === UI.pv ? "on" : ""}">PB ${i + 1}</button>`).join("")}</span>` : ""}<button class="btn sm ghost" id="pEdit">Sửa</button></div>
        ${vs.length ? `<div class="ptext">${spinMark(vs[UI.pv])}</div>` : `<div class="dim">Bài chỉ có ảnh.</div>`}
        ${(p.imageIds || []).length ? `<div class="pimgs">${p.imageIds.map((id, i) => `<div class="cv"><img data-img="${id}" alt="">${i === 0 ? "<span>Bìa</span>" : ""}</div>`).join("")}</div>` : ""}
        <div class="chips" style="margin-top:8px;flex-wrap:wrap">${(p.keywords || []).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div>
      </div>
    </aside>
    <div class="pmain">
      <div class="qhead">
        <span class="ds todo">○ Chưa đăng <span>${todo}</span></span>
        <span class="ds ok">✓ Đã đăng <span>${cnt("posted")}</span></span>
        <span class="ds wait">⏳ Chờ duyệt <span>${cnt("review")}</span></span>
        <span class="ds">Hôm nay <span>${tc}/${S.settings.dailyLimit}</span></span>
        <button class="btn primary" id="pStart" ${todo ? "" : "disabled"}>▶ Bắt đầu đăng ${todo} group</button>
      </div>
      ${mins !== null && mins < S.settings.minGapMin ? `<div class="banner">Lần đăng gần nhất ${GP.timeAgo(la)} — nên cách nhau ít nhất ${S.settings.minGapMin} phút.</div>` : ""}
      ${tc >= S.settings.dailyLimit ? `<div class="banner">Hôm nay đã đăng ${tc}/${S.settings.dailyLimit} group (giới hạn trong Cài đặt).</div>` : ""}
      <div class="toolbar">
        <input class="inp search" id="pQ" placeholder="Tìm group…" value="${esc(UI.pq)}">
        <label class="check"><input type="checkbox" id="pReady" ${UI.hideNotReady ? "checked" : ""}> Ẩn group chưa tham gia / link lỗi</label>
        <label class="check"><input type="checkbox" id="pAllCat" ${UI.allCat ? "checked" : ""}> Cả group khác category</label>
      </div>
      <div class="tablewrap">
        <div class="qh"><span>#</span><span>Group${(p.categories || []).length && !UI.allCat ? " · " + (p.categories || []).map((id) => esc((catById(id) || {}).name || "")).join(", ") : ""}</span><span style="text-align:right">Thành viên</span><span class="q-kw">Khớp từ khóa</span><span class="q-last">Đăng gần nhất</span><span class="q-st">Trạng thái</span><span></span></div>
        ${rows.length ? rows.map((r, i) => {
          const g = r.g, st = r.log && r.log.status, gs = gst(g), done = st === "posted" || st === "review";
          return `<div class="qr ${done ? "done" : ""}" data-g="${g.id}">
            <span class="no">${i + 1}</span>
            <div class="cell name"><span class="gdot" style="background:${gs.dot}" title="${gs.label}"></span><span class="t" title="${esc(g.name)}">${esc(g.name)}</span>${g.approval ? `<span class="appr">DUYỆT</span>` : ""}</div>
            <div class="cell mem"><b>${GP.fmtN(g.members)}</b></div>
            <div class="cell q-kw">${r.kw ? `<span class="hit">🔑 ${r.kw} khớp</span>` : `<span class="dim">—</span>`}</div>
            <div class="cell q-last dim">${r.last ? GP.timeAgo(r.last) : "—"}</div>
            <div class="cell q-st"><select class="st stsel" title="Đổi trạng thái"><option value="">${st ? "↺ Chưa đăng" : "Chưa đăng"}</option>${Object.entries(GP.STATUS).map(([k, x]) => `<option value="${k}" ${st === k ? "selected" : ""}>${x.label}</option>`).join("")}</select></div>
            <div><button class="btn sm ${done ? "ghost" : "primary"}" data-open="${g.id}">${done ? "Mở lại" : "Mở ▶"}</button></div>
          </div>`;
        }).join("") : `<div class="q-none"><b>Không có group phù hợp</b><br>Bỏ tick “Ẩn group chưa tham gia” hoặc bật “Cả group khác category”.</div>`}
      </div>
    </div>
  </div>`;
  hydrateThumbs(v);
  $$(".pitem", v).forEach((b) => (b.onclick = () => { UI.pi = b.dataset.id; UI.pv = 0; saveUI({ postId: UI.pi }); renderPostTab(); }));
  $$(".c2h .seg2 button", v).forEach((b) => (b.onclick = () => { UI.pv = +b.dataset.v; renderPostTab(); }));
  $("#pNew").onclick = () => { showView("content"); startEdit(null); };
  $("#pEdit").onclick = () => { showView("content"); startEdit(p); };
  $("#pQ").oninput = (e) => { UI.pq = e.target.value; const pos = e.target.selectionStart; renderPostTab(); const el = $("#pQ"); el.focus(); el.setSelectionRange(pos, pos); };
  $("#pReady").onchange = (e) => { UI.hideNotReady = e.target.checked; renderPostTab(); };
  $("#pAllCat").onchange = (e) => { UI.allCat = e.target.checked; renderPostTab(); };
  $$("[data-open]", v).forEach((b) => (b.onclick = () => openRow(b.dataset.open)));
  $$(".stsel", v).forEach((sel) => (sel.onchange = async () => {
    const gid = sel.closest(".qr").dataset.g, g = S.groups.find((x) => x.id === gid), key = p.id + "|" + gid, now = Date.now();
    if (sel.value) {
      S.logs[key] = { status: sel.value, ts: now, manual: true };
      S.history.push({ id: GP.uid("h_"), ts: now, date: GP.dayKey(now), postId: p.id, postTitle: p.title, groupId: gid, groupName: g.name, status: sel.value, user: S.settings.userName || "", local: true });
      await save({ logs: S.logs, history: S.history });
      await GP.enqueue({ action: "appendLogs", rows: [{ thoi_gian: new Date(now).toISOString(), ngay: GP.dayKey(now), bai_dang: p.title, group_id: gid, ten_group: g.name, trang_thai: sel.value, nguoi_dang: S.settings.userName || "" }] });
      chrome.runtime.sendMessage({ type: "flush" });
    } else { delete S.logs[key]; await save({ logs: S.logs }); }
    renderPostTab();
  }));
  const start = $("#pStart");
  if (start) start.onclick = () => { const f = rows.find((r) => !r.log || !["posted", "review"].includes(r.log.status)); if (f) openRow(f.g.id, true); };
}
async function openRow(gid, skipWarn) {
  const p = curPost(), g = S.groups.find((x) => x.id === gid);
  if (!p || !g) return;
  if (!GP.variants(p).length && !(p.imageIds || []).length) { toast("Bài này chưa có nội dung.", true); return; }
  const s = S.settings, warns = [], user = s.userName;
  const la = GP.lastPostAny(S.history, user);
  if (la && Date.now() - la < s.minGapMin * 60000) warns.push(`vừa đăng ${GP.timeAgo(la)}`);
  if (GP.todayCount(S.history, user) >= s.dailyLimit) warns.push(`đã đạt ${s.dailyLimit} group hôm nay`);
  const lg = GP.lastPostInGroup(gid, S.history);
  if (lg && Date.now() - lg < s.repostDays * 864e5) warns.push(`group này đã được đăng ${GP.timeAgo(lg)}`);
  if (!skipWarn && warns.length && !(UI.confirm && UI.confirm.id === gid && Date.now() - UI.confirm.ts < 8000)) {
    UI.confirm = { id: gid, ts: Date.now() };
    toast("Lưu ý: " + warns.join("; ") + ". Bấm lại để vẫn mở.", "warn");
    return;
  }
  UI.confirm = null;
  const { text, variant } = GP.buildText(p, S.logs);
  let copied = false;
  if (text) { try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {} }
  const queue = queueFiltered(p).map((r) => r.g.id);
  const r = await chrome.runtime.sendMessage({ type: "open", postId: p.id, groupId: gid, queue, text, variant });
  if (!r || !r.ok) { toast((r && r.error) || "Không mở được group.", true); return; }
  toast(copied ? `Đã mở “${g.name}” · nội dung đã copy sẵn` : `Đã mở “${g.name}”`);
}

/* ===================== TAB NỘI DUNG ===================== */
function renderContentTab() {
  const v = $("#viewContent");
  if (UI.editing) return renderEditor();
  const doneCount = (p) => Object.keys(S.logs).filter((k) => k.startsWith(p.id + "|") && GP.DONE.includes(S.logs[k].status)).length;
  const posts = [...S.posts].sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
  v.innerHTML = `
    <div class="actions"><button class="btn primary" id="cNew">+ Bài mới</button><span class="hint" style="align-self:center">Bài và ảnh lưu trên máy này.</span></div>
    <div class="list">${posts.length ? posts.map((p) => {
      const ids = p.imageIds || [], vs = GP.variants(p);
      return `<div class="card" data-id="${p.id}">
        <div style="display:flex;gap:10px">
          ${ids.length ? `<img class="thumb" style="width:58px;height:58px;border-radius:8px;object-fit:cover" data-img="${ids[0]}" alt="">` : ""}
          <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px">
            <div class="row-title">${esc(p.title || "(chưa đặt tên)")}</div>
            <div class="chips" style="flex-wrap:wrap">${chipsHTML(p.categories)}${(p.keywords || []).slice(0, 4).map((k) => `<span class="kw">${esc(k)}</span>`).join("")}</div>
            <div class="meta">${vs.length} phiên bản · ${ids.length} ảnh · đã lên ${doneCount(p)} group</div>
          </div>
        </div>
        ${vs[0] ? `<div class="excerpt" style="margin-top:6px">${esc(vs[0])}</div>` : ""}
        <div class="actions" style="margin-top:8px"><button class="btn primary sm" data-a="post">Đăng ▶</button><button class="btn sm" data-a="edit">Sửa</button><button class="btn sm ghost" data-a="dup">Nhân bản</button></div>
      </div>`;
    }).join("") : `<div class="empty empty-card"><b>Chưa có bài đăng</b>Mỗi bài gồm nội dung (có thể nhiều phiên bản), nhiều ảnh, category và từ khóa.</div>`}</div>`;
  $("#cNew").onclick = () => startEdit(null);
  $$(".card[data-id]", v).forEach((card) => (card.onclick = (e) => {
    const a = e.target.closest("[data-a]"); if (!a) return;
    const p = S.posts.find((x) => x.id === card.dataset.id);
    if (a.dataset.a === "edit") startEdit(p);
    if (a.dataset.a === "post") { UI.pi = p.id; saveUI({ postId: p.id }); showView("post"); }
    if (a.dataset.a === "dup") duplicatePost(p);
  }));
  hydrateThumbs(v);
}
async function duplicatePost(p) {
  const copy = JSON.parse(JSON.stringify(p));
  Object.assign(copy, { id: GP.uid("p_"), title: (p.title || "Bài") + " (bản sao)", createdAt: Date.now(), updatedAt: Date.now(), imageIds: [] });
  for (const id of p.imageIds || []) { const r = await GP.idb.get(id); if (!r) continue; const nr = Object.assign({}, r, { id: GP.uid("img_") }); await GP.idb.put(nr); copy.imageIds.push(nr.id); }
  S.posts.push(copy);
  await save({ posts: S.posts });
  toast("Đã nhân bản bài");
  renderContentTab();
}
function startEdit(post) {
  UI.editing = { isNew: !post, draft: post ? JSON.parse(JSON.stringify(post)) : { id: GP.uid("p_"), title: "", categories: [], keywords: [], variants: [""], imageIds: [] }, added: [], removed: [] };
  if (!UI.editing.draft.variants || !UI.editing.draft.variants.length) UI.editing.draft.variants = [""];
  renderContentTab();
}
let edCats = null, edKws = null;
function renderEditor() {
  const E = UI.editing, d = E.draft, v = $("#viewContent");
  v.innerHTML = `
    <div class="ed-head"><button class="btn ghost sm" id="eBack">← Danh sách</button><b>${E.isNew ? "Bài mới" : "Sửa bài"}</b></div>
    <div class="card">
      <label class="lbl">Tiêu đề <span class="hint">để nhận biết, không đăng lên</span></label>
      <input class="inp" id="eTitle" style="width:100%" value="${esc(d.title)}" placeholder="VD: Qranty – bảo hành điện tử T9">
      <label class="lbl">Category</label><div id="eCats"></div>
      <label class="lbl">Từ khóa <span class="hint">ghép với từ khóa của group</span></label><div id="eKw"></div>
    </div>
    <div class="card">
      <div class="card-h"><b>Nội dung</b><span class="hint">Mỗi group nhận lần lượt 1 phiên bản. Viết <code>{chào|xin chào}</code> để tự đổi từ.</span></div>
      <div id="eVars"></div>
      <button class="btn sm" id="eAddVar">+ Thêm phiên bản</button>
    </div>
    <div class="card">
      <div class="card-h"><b>Ảnh</b><span class="hint" id="eImgCount"></span></div>
      <div class="drop" id="eDrop"><input type="file" id="eFile" accept="image/*" multiple hidden>
        <div>Kéo thả ảnh vào đây · <button class="link" id="ePick" type="button">chọn nhiều ảnh</button> · hoặc dán (⌘/Ctrl+V)</div>
        <div class="hint" style="margin-top:3px">Kéo ảnh để đổi thứ tự · ảnh số 1 là ảnh bìa · ảnh lớn tự nén về 2048px</div></div>
      <div class="imgs" id="eImgs"></div>
    </div>
    <div class="ed-foot">${E.isNew ? "" : `<button class="btn danger" id="eDel">Xoá bài</button>`}<span class="sp"></span><button class="btn ghost" id="eCancel">Huỷ</button><button class="btn primary" id="eSave">Lưu bài</button></div>`;
  edCats = catPicker($("#eCats"), d.categories);
  edKws = tagInput($("#eKw"), d.keywords, "VD: bảo hành, sửa điện thoại");
  $("#eTitle").oninput = (e) => { d.title = e.target.value; };
  drawVariants(); drawImages();
  $("#eAddVar").onclick = () => { d.variants.push(""); drawVariants(true); };
  $("#ePick").onclick = () => $("#eFile").click();
  $("#eFile").onchange = (e) => { const fs = [...e.target.files]; e.target.value = ""; addImages(fs); };
  const drop = $("#eDrop");
  drop.ondragover = (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); drop.classList.add("over"); } };
  drop.ondragleave = () => drop.classList.remove("over");
  drop.ondrop = (e) => { drop.classList.remove("over"); if (!e.dataTransfer.files.length) return; e.preventDefault(); addImages([...e.dataTransfer.files]); };
  $("#eBack").onclick = cancelEdit; $("#eCancel").onclick = cancelEdit; $("#eSave").onclick = saveEdit;
  armed($("#eDel"), deletePost, "Bấm lại để xoá bài");
}
function drawVariants(focusLast) {
  const d = UI.editing.draft, box = $("#eVars");
  box.innerHTML = d.variants.map((val, i) => `<div class="var"><div class="var-h">Phiên bản ${i + 1}<span class="cnt" data-cnt="${i}">${val.length} ký tự</span><span class="sp"></span>${d.variants.length > 1 ? `<button class="btn ghost sm danger" data-rm="${i}" type="button">Xoá</button>` : ""}</div><textarea class="inp" style="width:100%" data-v="${i}" placeholder="Nội dung bài đăng…">${esc(val)}</textarea></div>`).join("");
  $$("textarea[data-v]", box).forEach((ta) => (ta.oninput = () => { d.variants[+ta.dataset.v] = ta.value; $(`[data-cnt="${ta.dataset.v}"]`, box).textContent = ta.value.length + " ký tự"; }));
  $$("[data-rm]", box).forEach((b) => (b.onclick = () => { d.variants.splice(+b.dataset.rm, 1); drawVariants(); }));
  if (focusLast) { const t = $$("textarea", box).pop(); t && t.focus(); }
}
function drawImages() {
  const E = UI.editing, d = E.draft, box = $("#eImgs");
  $("#eImgCount").textContent = d.imageIds.length ? `${d.imageIds.length} ảnh` : "";
  box.innerHTML = d.imageIds.map((id, i) => `<div class="img" draggable="true" data-i="${i}"><img data-img="${id}" alt=""><span class="no">${i + 1}</span>${i === 0 ? `<span class="cover">Ảnh bìa</span>` : ""}<button class="rm" data-rm="${i}" type="button">×</button></div>`).join("");
  hydrateThumbs(box);
  let from = null;
  $$(".img", box).forEach((el) => {
    el.ondragstart = (e) => { from = +el.dataset.i; el.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/gp-idx", String(from)); };
    el.ondragend = () => el.classList.remove("dragging");
    el.ondragover = (e) => { if (from !== null) { e.preventDefault(); el.classList.add("over"); } };
    el.ondragleave = () => el.classList.remove("over");
    el.ondrop = (e) => { el.classList.remove("over"); if (from === null) return; e.preventDefault(); const [m] = d.imageIds.splice(from, 1); d.imageIds.splice(+el.dataset.i, 0, m); from = null; drawImages(); };
  });
  $$("[data-rm]", box).forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const [id] = d.imageIds.splice(+b.dataset.rm, 1);
    if (E.added.includes(id)) { E.added = E.added.filter((x) => x !== id); await GP.idb.del(id); } else E.removed.push(id);
    drawImages();
  }));
}
async function processImage(file) {
  if (!file.type.startsWith("image/")) return null;
  let blob = file, name = file.name || "anh.jpg", w = 0, h = 0;
  if (file.type !== "image/gif") {
    try {
      const bmp = await createImageBitmap(file);
      w = bmp.width; h = bmp.height;
      if (Math.max(w, h) > 2048 || file.size > 1.5 * 1024 * 1024 || !/^image\/(jpeg|png)$/.test(file.type)) {
        const sc = Math.min(1, 2048 / Math.max(w, h)), cw = Math.round(w * sc), ch = Math.round(h * sc);
        const c = new OffscreenCanvas(cw, ch), ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cw, ch); ctx.drawImage(bmp, 0, 0, cw, ch);
        blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.88 });
        name = name.replace(/\.[a-z0-9]+$/i, "") + ".jpg"; w = cw; h = ch;
      }
      bmp.close && bmp.close();
    } catch (e) {}
  }
  return { id: GP.uid("img_"), blob, name, w, h, createdAt: Date.now() };
}
async function addImages(files) {
  const E = UI.editing; if (!E) return;
  const imgs = files.filter((f) => f.type.startsWith("image/"));
  if (!imgs.length) { toast("Chỉ nhận file ảnh.", true); return; }
  toast(`Đang xử lý ${imgs.length} ảnh…`);
  for (const f of imgs) { const rec = await processImage(f); if (!rec) continue; await GP.idb.put(rec); E.draft.imageIds.push(rec.id); E.added.push(rec.id); }
  if ($("#eImgs")) drawImages();
  toast(`Đã thêm ${imgs.length} ảnh`);
}
async function cancelEdit() { const E = UI.editing; if (E) for (const id of E.added) await GP.idb.del(id); UI.editing = null; renderContentTab(); }
async function saveEdit() {
  const E = UI.editing, d = E.draft;
  d.categories = edCats.get(); d.keywords = edKws.get();
  const vs = d.variants.map((x) => x.replace(/\s+$/, "")).filter((x) => x.trim());
  if (!vs.length && !d.imageIds.length) { toast("Bài cần ít nhất nội dung chữ hoặc ảnh.", true); return; }
  d.variants = vs.length ? vs : [""];
  d.title = (d.title || "").trim() || (vs[0] || "Bài ảnh").split("\n")[0].slice(0, 50);
  d.updatedAt = Date.now();
  if (E.isNew) { d.createdAt = Date.now(); S.posts.push(d); } else S.posts = S.posts.map((p) => (p.id === d.id ? d : p));
  for (const id of E.removed) { await GP.idb.del(id); thumbCache.delete(id); }
  await save({ posts: S.posts });
  UI.editing = null; UI.pi = d.id; saveUI({ postId: d.id });
  toast(`Đã lưu “${d.title}”`);
  renderContentTab();
}
async function deletePost() {
  const E = UI.editing, d = E.draft, orig = S.posts.find((p) => p.id === d.id);
  for (const id of new Set([...(orig ? orig.imageIds || [] : []), ...d.imageIds, ...E.added, ...E.removed])) await GP.idb.del(id);
  S.posts = S.posts.filter((p) => p.id !== d.id);
  for (const k of Object.keys(S.logs)) if (k.startsWith(d.id + "|")) delete S.logs[k];
  await save({ posts: S.posts, logs: S.logs });
  UI.editing = null;
  toast("Đã xoá bài");
  renderContentTab();
}

/* ===================== TAB CÀI ĐẶT ===================== */
function renderSettingsTab() {
  const s = S.settings, v = $("#viewSettings");
  v.innerHTML = `
    <div class="card">
      <div class="card-h"><b>Google Sheet dùng chung</b><span class="hint">Nguồn gốc danh sách group + category cho cả đội</span></div>
      <label class="lbl">Link ứng dụng web Apps Script (…/exec)</label>
      <input class="inp" id="sUrl" style="width:100%" value="${esc(s.sheetUrl)}" placeholder="https://script.google.com/macros/s/…/exec">
      <div class="grid2">
        <div><label class="lbl">Mã bí mật</label><input class="inp" id="sKey" type="password" style="width:100%" value="${esc(s.sheetKey)}"></div>
        <div><label class="lbl">Tên người đăng (hiện trong lịch sử)</label><input class="inp" id="sUser" style="width:100%" value="${esc(s.userName)}" placeholder="VD: Hưng"></div>
      </div>
      <div class="actions" style="margin-top:10px">
        <button class="btn primary" id="sTest">Lưu &amp; kiểm tra kết nối</button>
        <button class="btn" id="sPull" ${s.sheetUrl ? "" : "disabled"}>↻ Đồng bộ ngay</button>
        ${s.sheetUrl ? `<button class="btn ghost danger" id="sDisc">Ngắt kết nối</button>` : ""}
      </div>
      <p class="hint" id="sStatus" style="margin:8px 0 0">${s.sheetUrl ? `Lần đồng bộ: ${GP.timeAgo(s.lastPull)} · chờ gửi: ${(S.syncQueue || []).length} thay đổi${s.syncError ? ` · <b style="color:#B91C1C">Lỗi: ${esc(s.syncError)}</b>` : ""}` : "Chưa kết nối — dữ liệu chỉ nằm trên máy này."}</p>
    </div>
    <div class="card">
      <div class="card-h"><b>Category</b></div>
      <div id="sCats"></div>
      <div class="set-row" style="margin-top:6px"><input type="color" id="sCatColor" value="${GP.PALETTE[S.categories.length % GP.PALETTE.length]}"><input class="inp" id="sCatName" placeholder="Tên category mới"><button class="btn primary sm" id="sCatAdd">Thêm</button></div>
    </div>
    <div class="card">
      <div class="card-h"><b>Từ khóa</b><span class="hint">Đổi tên / xoá áp dụng cho mọi group &amp; bài</span></div>
      <div id="sKws" class="kw-list"></div>
    </div>
    <div class="card">
      <div class="card-h"><b>Nhịp đăng an toàn</b><span class="hint">Chỉ cảnh báo, không chặn</span></div>
      <div class="grid3">
        <div><label class="lbl">Cách nhau tối thiểu (phút)</label><input class="inp" type="number" min="0" id="sGap" style="width:100%" value="${s.minGapMin}"></div>
        <div><label class="lbl">Tối đa group/ngày</label><input class="inp" type="number" min="1" id="sDaily" style="width:100%" value="${s.dailyLimit}"></div>
        <div><label class="lbl">Cảnh báo đăng lại (ngày)</label><input class="inp" type="number" min="0" id="sRepost" style="width:100%" value="${s.repostDays}"></div>
      </div>
    </div>
    <div class="card">
      <div class="card-h"><b>Dữ liệu trên máy</b><span class="hint">Group Poster v${GP.VERSION}</span></div>
      <div class="actions"><button class="btn" id="sBackup">Sao lưu (JSON)</button><button class="btn" id="sRestore">Khôi phục từ file</button><input type="file" id="sFile" accept=".json" hidden><button class="btn danger" id="sClearLog">Xoá lịch sử đăng</button></div>
      <p class="hint" style="margin:8px 0 0">Sao lưu gồm bài viết, ảnh, group, category, lịch sử. Khôi phục sẽ thay dữ liệu hiện tại trên máy.</p>
    </div>`;
  const readConn = () => ({ sheetUrl: $("#sUrl").value.trim(), sheetKey: $("#sKey").value.trim(), userName: $("#sUser").value.trim() });
  $("#sTest").onclick = async () => {
    const c = readConn();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(c.sheetUrl)) { toast("Link phải dạng https://script.google.com/macros/s/…/exec", true); return; }
    if (!c.sheetKey) { toast("Nhập mã bí mật.", true); return; }
    $("#sStatus").textContent = "Đang kiểm tra…";
    const r = await chrome.runtime.sendMessage({ type: "ping", settings: c });
    if (!r || !r.ok) { $("#sStatus").innerHTML = `<b style="color:#B91C1C">Không kết nối được: ${esc((r && r.error) || "")}</b>`; return; }
    await save({ settings: Object.assign({}, S.settings, c, { syncError: "" }) });
    toast(`Đã kết nối “${r.sheet}” ✓ Đang đồng bộ…`);
    await doPull(true);
    renderSettingsTab();
  };
  if ($("#sPull")) $("#sPull").onclick = async () => { await doPull(true); renderSettingsTab(); };
  armed($("#sDisc"), async () => { await save({ settings: Object.assign({}, S.settings, { sheetUrl: "", sheetKey: "", syncError: "" }), syncQueue: [] }); renderSync(); renderSettingsTab(); toast("Đã ngắt kết nối Google Sheet"); }, "Bấm lại để ngắt");
  $("#sUser").onchange = () => { save({ settings: Object.assign({}, S.settings, { userName: $("#sUser").value.trim() }) }); };
  drawCats(); drawKws();
  $("#sCatAdd").onclick = addCat;
  $("#sCatName").onkeydown = (e) => { if (e.key === "Enter") addCat(); };
  const num = (id, key, min) => ($(id).onchange = (e) => { const val = Math.max(min, parseInt(e.target.value, 10) || 0); e.target.value = val; save({ settings: Object.assign({}, S.settings, { [key]: val }) }); toast("Đã lưu cài đặt"); });
  num("#sGap", "minGapMin", 0); num("#sDaily", "dailyLimit", 1); num("#sRepost", "repostDays", 0);
  $("#sBackup").onclick = backup;
  armed($("#sRestore"), () => $("#sFile").click(), "Bấm lại để chọn file");
  $("#sFile").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) restore(await f.text()); };
  armed($("#sClearLog"), async () => { await save({ logs: {}, history: [] }); toast("Đã xoá lịch sử đăng trên máy"); }, "Bấm lại để xoá");
}
function drawCats() {
  const box = $("#sCats");
  box.innerHTML = S.categories.map((c) => `<div class="set-row" data-id="${c.id}"><input type="color" value="${c.color}"><input class="inp" value="${esc(c.name)}"><span class="cnt">${S.groups.filter((g) => (g.categories || []).includes(c.id)).length} group · ${S.posts.filter((p) => (p.categories || []).includes(c.id)).length} bài</span><button class="btn ghost sm danger" data-del>Xoá</button></div>`).join("") || `<p class="hint">Chưa có category.</p>`;
  $$(".set-row[data-id]", box).forEach((row) => {
    const c = S.categories.find((x) => x.id === row.dataset.id), [color, name] = $$("input", row);
    color.onchange = async () => { c.color = color.value; await commitCategories([c]); toast("Đã đổi màu"); };
    name.onchange = async () => {
      const val = name.value.trim();
      if (!val || S.categories.some((x) => x.id !== c.id && x.name.toLowerCase() === val.toLowerCase())) { name.value = c.name; toast("Tên trống hoặc đã tồn tại.", true); return; }
      c.name = val; await commitCategories([c]);
      const affected = S.groups.filter((g) => (g.categories || []).includes(c.id));
      if (affected.length) await commitGroups(affected);
      toast("Đã đổi tên category");
    };
    armed($("[data-del]", row), async () => {
      const affected = S.groups.filter((g) => (g.categories || []).includes(c.id));
      S.categories = S.categories.filter((x) => x.id !== c.id);
      affected.forEach((g) => { g.categories = g.categories.filter((x) => x !== c.id); });
      S.posts.forEach((p) => { p.categories = (p.categories || []).filter((x) => x !== c.id); });
      await save({ posts: S.posts });
      await commitCategories([], [c.id]);
      await commitGroups(affected);
      toast(`Đã xoá category “${c.name}”`);
      drawCats();
    }, "Xoá?");
  });
}
async function addCat() {
  const name = $("#sCatName").value.trim();
  if (!name) return;
  if (S.categories.some((x) => x.name.toLowerCase() === name.toLowerCase())) { toast("Category đã tồn tại.", true); return; }
  const c = { id: GP.uid("cat_"), name, color: $("#sCatColor").value };
  S.categories.push(c);
  await commitCategories([c]);
  toast(`Đã thêm “${name}”`);
  renderSettingsTab();
}
function drawKws() {
  const box = $("#sKws"), kws = allKeywords();
  box.innerHTML = kws.length ? kws.map((k) => `<div class="set-row" data-k="${esc(k.k)}"><input class="inp" value="${esc(k.k)}"><span class="cnt">${k.g} group · ${k.p} bài</span><button class="btn ghost sm danger" data-del>Xoá</button></div>`).join("") : `<p class="hint">Chưa có từ khóa.</p>`;
  const replaceKw = async (oldK, newK) => {
    const fix = (list) => [...new Set((list || []).map((x) => (x === oldK ? newK : x)).filter(Boolean))];
    const affected = S.groups.filter((g) => (g.keywords || []).includes(oldK));
    affected.forEach((g) => { g.keywords = fix(g.keywords); });
    S.posts.forEach((p) => { p.keywords = fix(p.keywords); });
    await save({ posts: S.posts });
    await commitGroups(affected);
  };
  $$(".set-row[data-k]", box).forEach((row) => {
    const oldK = row.dataset.k, inp = $("input", row);
    inp.onchange = async () => { const val = GP.normKw(inp.value); if (!val) { inp.value = oldK; return; } await replaceKw(oldK, val); toast(`Đã đổi “${oldK}” → “${val}”`); drawKws(); };
    armed($("[data-del]", row), async () => { await replaceKw(oldK, null); toast(`Đã xoá “${oldK}”`); drawKws(); }, "Xoá?");
  });
}
async function backup() {
  toast("Đang tạo bản sao lưu…");
  const images = [];
  for (const r of await GP.idb.all()) images.push({ id: r.id, name: r.name, w: r.w, h: r.h, createdAt: r.createdAt, dataUrl: await GP.blobToDataUrl(r.blob) });
  const data = { app: "group-poster", version: 2, exportedAt: new Date().toISOString(), categories: S.categories, groups: S.groups, posts: S.posts, logs: S.logs, history: S.history, settings: Object.assign({}, S.settings, { sheetKey: "" }), images };
  downloadBlob(new Blob([JSON.stringify(data)], { type: "application/json" }), `group-poster-backup-${GP.dayKey(Date.now())}.json`);
  toast(`Đã sao lưu ${S.posts.length} bài · ${images.length} ảnh · ${S.groups.length} group`);
}
async function restore(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { toast("File không phải JSON hợp lệ.", true); return; }
  if (!data || data.app !== "group-poster") { toast("File không phải bản sao lưu Group Poster.", true); return; }
  await GP.idb.clear(); thumbCache.clear();
  for (const im of data.images || []) await GP.idb.put({ id: im.id, name: im.name, w: im.w, h: im.h, createdAt: im.createdAt, blob: GP.dataUrlToBlob(im.dataUrl) });
  const keep = { sheetUrl: S.settings.sheetUrl, sheetKey: S.settings.sheetKey, userName: S.settings.userName };
  await save({ categories: data.categories || GP.DEFAULT_CATEGORIES, groups: data.groups || [], posts: data.posts || [], logs: data.logs || {}, history: data.history || [], settings: Object.assign({}, GP.DEFAULT_SETTINGS, data.settings || {}, keep) });
  toast(`Đã khôi phục ${(data.posts || []).length} bài · ${(data.groups || []).length} group`);
  renderSettingsTab();
}
