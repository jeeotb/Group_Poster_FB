/* Group Poster — bảng nổi trên trang group Facebook.
   Điền chữ + nhiều ảnh vào ô soạn bài. KHÔNG BAO GIỜ tự bấm "Đăng". */
(function () {
  if (window.top !== window.self) return;
  if (window.__gpFiller) return;
  window.__gpFiller = true;

  const MAX_AGE = 3 * 60 * 60 * 1000;
  let active = null, panel = null, pill = null, hidden = false;
  let images = null, copyIdx = 0;

  const onGroupPage = () => /^\/groups\/[^\/]+/i.test(location.pathname);

  /* ---------- tiện ích DOM ---------- */
  function visible(el, minW = 40, minH = 10) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < minW || r.height < minH) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }
  const waitFor = (fn, timeout = 6000, step = 200) => new Promise((res) => {
    const t0 = Date.now();
    (function tick() {
      let v = null;
      try { v = fn(); } catch (e) {}
      if (v) return res(v);
      if (Date.now() - t0 > timeout) return res(null);
      setTimeout(tick, step);
    })();
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const inPanel = (el) => panel && panel.contains(el);

  function activeDialog() {
    const ds = [...document.querySelectorAll('[role="dialog"]')]
      .filter((d) => !inPanel(d) && visible(d, 200, 100) && d.querySelector('[contenteditable="true"]'));
    return ds.length ? ds[ds.length - 1] : null;
  }
  /* Chỉ lấy ô soạn trong hộp thoại, tránh dán nhầm vào ô bình luận */
  function findComposer() {
    const dlg = activeDialog();
    if (!dlg) return null;
    let c = [...dlg.querySelectorAll('div[role="textbox"][contenteditable="true"], div[contenteditable="true"][data-lexical-editor="true"]')].filter((e) => visible(e, 120, 18));
    if (!c.length) c = [...dlg.querySelectorAll('[contenteditable="true"]')].filter((e) => visible(e, 120, 18));
    c.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height);
    return c[0] || null;
  }
  function findTrigger() {
    const re = /^(bạn viết gì đi|viết gì đó|write something|what's on your mind|bạn đang nghĩ gì)/i;
    const cands = [...document.querySelectorAll('[role="button"], span, div[tabindex]')].filter((el) => {
      if (inPanel(el)) return false;
      const t = (el.textContent || "").trim();
      return t.length < 60 && re.test(t) && visible(el);
    });
    for (const c of cands) {
      const b = c.closest('[role="button"]');
      if (b && visible(b) && !inPanel(b)) return b;
    }
    return cands[0] || null;
  }
  function findFileInput(scope) {
    return [...scope.querySelectorAll('input[type="file"]')].find((i) => !i.disabled && (!i.accept || /image|\*/i.test(i.accept))) || null;
  }
  function findPhotoBtn(scope) {
    const re = /^(ảnh\/video|ảnh|photo\/video|photo|thêm ảnh)/i;
    return [...scope.querySelectorAll('[aria-label], [role="button"]')].find((el) => {
      const t = (el.getAttribute("aria-label") || el.textContent || "").trim();
      return t.length < 30 && re.test(t) && visible(el, 16, 16);
    }) || null;
  }
  function previewCount(scope) {
    if (!scope) return 0;
    return scope.querySelectorAll('img[src^="blob:"], img[src^="data:"], [style*="blob:"], video[src^="blob:"]').length;
  }

  /* ---------- chữ ---------- */
  async function copyTextToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {}
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    } catch (e) { return false; }
  }
  function insertViaPaste(el, text) {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.focus();
    el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
  }
  function insertLineByLine(el, text) {
    el.focus();
    text.split("\n").forEach((ln, i) => {
      if (i > 0) document.execCommand("insertParagraph");
      if (ln) document.execCommand("insertText", false, ln);
    });
  }
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

  async function openAndFill() {
    if (!active.text) { flash("Bài này không có nội dung chữ.", true); return; }
    let el = findComposer();
    if (!el) {
      const trg = findTrigger();
      if (!trg) { flash('Không thấy ô "Bạn viết gì đi…". Hãy tự mở ô soạn bài rồi bấm lại.', true); return; }
      trg.click();
      flash("Đang mở ô soạn bài…");
      el = await waitFor(findComposer, 7000);
    }
    if (!el) { flash("Ô soạn chưa mở được. Mở thủ công rồi bấm lại, hoặc dùng Copy chữ.", true); return; }
    const head = norm(active.text).slice(0, 40);
    if (head && norm(el.textContent).includes(head)) { flash("Ô soạn đã có nội dung này rồi ✓"); return; }
    const before = (el.textContent || "").length;
    insertViaPaste(el, active.text);
    await sleep(300);
    if ((el.textContent || "").length <= before + 2) insertLineByLine(el, active.text);
    flash("Đã điền nội dung ✓" + (active.imageIds.length ? " Tiếp theo: chèn ảnh." : " Kiểm tra rồi bấm Đăng."));
  }

  /* ---------- ảnh ---------- */
  async function getImages() {
    if (images) return images;
    const r = await chrome.runtime.sendMessage({ type: "images", ids: active.imageIds || [] });
    images = (r && r.images) || [];
    return images;
  }
  function dataUrlToFile(im, i) {
    const d = im.dataUrl, k = d.indexOf(",");
    const type = (d.slice(0, k).match(/data:([^;,]+)/) || [])[1] || "image/jpeg";
    const bin = atob(d.slice(k + 1));
    const arr = new Uint8Array(bin.length);
    for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
    const ext = (type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const base = (im.name || "anh-" + (i + 1)).replace(/\.[a-z0-9]+$/i, "");
    return new File([arr], base + "." + ext, { type });
  }

  async function insertImages() {
    const ims = await getImages();
    if (!ims.length) { flash("Bài này không có ảnh.", true); return; }
    let dlg = activeDialog();
    if (!dlg) { flash("Mở ô soạn bài trước (bấm nút ①).", true); return; }
    const files = ims.map(dataUrlToFile);
    const make = () => { const dt = new DataTransfer(); files.forEach((f) => dt.items.add(f)); return dt; };
    const before = previewCount(dlg);
    const grew = () => previewCount(activeDialog() || dlg) > before;
    flash(`Đang chèn ${files.length} ảnh…`);

    // Cách 1: ô chọn file của Facebook (nhận nhiều ảnh 1 lần)
    let input = findFileInput(dlg);
    if (!input) {
      const btn = findPhotoBtn(dlg);
      if (btn) { btn.click(); input = await waitFor(() => findFileInput(activeDialog() || dlg), 2500); }
    }
    if (input) {
      try { input.files = make().files; input.dispatchEvent(new Event("change", { bubbles: true })); } catch (e) {}
      if (await waitFor(grew, 3500)) { done(); return; }
    }
    // Cách 2: dán file vào ô soạn
    const ed = findComposer();
    if (ed) {
      ed.focus();
      ed.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: make() }));
      if (await waitFor(grew, 3000)) { done(); return; }
      // Cách 3: giả lập kéo thả
      const dt = make();
      ["dragenter", "dragover", "drop"].forEach((t) => ed.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt })));
      if (await waitFor(grew, 3000)) { done(); return; }
    }
    flash(`Chưa chèn tự động được. Dùng "Copy ảnh 1/${files.length}" rồi dán (⌘/Ctrl+V), hoặc "Tải ảnh" rồi kéo vào.`, true);

    function done() { flash(`Đã chèn ${files.length} ảnh ✓ Nếu thấy ảnh bị trùng, xoá bớt trước khi Đăng.`); }
  }

  function toPngBlob(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        c.toBlob((b) => (b ? res(b) : rej(new Error("png"))), "image/png");
      };
      img.onerror = rej;
      img.src = dataUrl;
    });
  }
  async function copyNextImage() {
    const ims = await getImages();
    if (!ims.length) { flash("Bài này không có ảnh.", true); return; }
    const i = copyIdx % ims.length;
    try {
      const png = await toPngBlob(ims[i].dataUrl);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      copyIdx = i + 1;
      flash(`Đã copy ảnh ${i + 1}/${ims.length} ✓ Bấm vào ô soạn rồi dán (⌘/Ctrl+V).`);
      updateCopyBtn();
    } catch (e) {
      flash('Trình duyệt chặn copy ảnh — dùng "Tải ảnh" rồi kéo vào ô soạn.', true);
    }
  }
  function updateCopyBtn() {
    const b = panel && panel.querySelector('[data-a="copyimg"]');
    const n = (active.imageIds || []).length;
    if (b && n) b.textContent = `🖼️ Copy ảnh ${(copyIdx % n) + 1}/${n}`;
  }
  async function downloadAll() {
    const r = await chrome.runtime.sendMessage({ type: "download", ids: active.imageIds || [], title: active.postTitle || active.groupName });
    if (r && r.ok) flash(`Đã tải ${r.count} ảnh vào thư mục Downloads/GroupPoster — kéo thả vào ô soạn.`);
    else flash("Không tải được ảnh.", true);
  }

  /* ---------- trạng thái & chuyển group ---------- */
  async function setStatus(status, label) {
    const r = await chrome.runtime.sendMessage({ type: "status", status });
    if (r && r.ok) {
      flash(`Đã đánh dấu: ${label}.`);
      panel.querySelectorAll("[data-st]").forEach((b) => b.classList.toggle("on", b.dataset.st === status));
    } else flash((r && r.error) || "Không lưu được trạng thái.", true);
  }
  async function goNext() {
    flash("Đang mở group tiếp theo…");
    const r = await chrome.runtime.sendMessage({ type: "next" });
    if (!r || !r.ok) flash((r && r.error) || "Không mở được group tiếp theo.", true);
  }

  /* ---------- giao diện ---------- */
  function render() {
    if (!active) return;
    if (panel) panel.remove();
    const n = (active.imageIds || []).length;
    const q = active.queue || [];
    const pos = q.indexOf(active.groupId);
    panel = document.createElement("div");
    panel.id = "gp-panel";
    panel.innerHTML = `
      <div class="gp-hd">
        <span class="gp-logo">GP</span><b>Group Poster</b>
        ${pos >= 0 ? `<span class="gp-tag">${pos + 1}/${q.length}</span>` : ""}
        <button class="gp-x" data-a="min" title="Thu nhỏ">–</button>
      </div>
      <div class="gp-body">
        <div class="gp-group" title="${esc(active.groupName)}">${esc(active.groupName)}</div>
        <div class="gp-sub">${esc(active.postTitle || "Bài đăng")}${active.variantCount > 1 ? ` · phiên bản ${active.variant + 1}/${active.variantCount}` : ""}${n ? ` · ${n} ảnh` : ""}</div>
        ${active.approval ? `<div class="gp-note">Group này duyệt bài trước khi hiển thị.</div>` : ""}
        ${active.groupRules ? `<div class="gp-note">Luật: ${esc(active.groupRules)}</div>` : ""}
        <div class="gp-step">① Nội dung</div>
        <div class="gp-row">
          <button class="gp-b gp-primary" data-a="fill">Mở &amp; điền chữ</button>
          <button class="gp-b" data-a="copytext">📋 Copy chữ</button>
        </div>
        ${n ? `
        <div class="gp-step">② Ảnh (${n})</div>
        <div class="gp-row">
          <button class="gp-b gp-primary" data-a="images">Chèn ${n} ảnh</button>
          <button class="gp-b" data-a="copyimg">🖼️ Copy ảnh 1/${n}</button>
        </div>
        <div class="gp-row"><button class="gp-b gp-ghost" data-a="dl">⬇ Tải ${n} ảnh về máy</button></div>` : ""}
        <div class="gp-step">${n ? "③" : "②"} Bạn tự bấm Đăng, rồi đánh dấu</div>
        <div class="gp-row gp-st">
          <button class="gp-b" data-st="posted">✓ Đã đăng</button>
          <button class="gp-b" data-st="review">Chờ duyệt</button>
          <button class="gp-b" data-st="skipped">Bỏ qua</button>
        </div>
        <div class="gp-row"><button class="gp-b gp-next" data-a="next">Group tiếp theo →</button></div>
        <div class="gp-flash" id="gp-flash"></div>
      </div>`;
    document.documentElement.appendChild(panel);
    if (hidden) panel.style.display = "none";

    panel.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const labels = { posted: "Đã đăng", review: "Chờ duyệt", skipped: "Bỏ qua" };
      if (b.dataset.st) return setStatus(b.dataset.st, labels[b.dataset.st]);
      const a = b.dataset.a;
      if (a === "min") return minimize(true);
      if (a === "fill") return openAndFill();
      if (a === "copytext") return copyTextToClipboard(active.text).then((ok) => flash(ok ? "Đã copy chữ ✓ Bấm vào ô soạn rồi dán (⌘/Ctrl+V)." : "Không copy được.", !ok));
      if (a === "images") return insertImages();
      if (a === "copyimg") return copyNextImage();
      if (a === "dl") return downloadAll();
      if (a === "next") return goNext();
    });
    makeDraggable(panel, panel.querySelector(".gp-hd"));
    chrome.storage.local.get("logs").then(({ logs }) => {
      const l = logs && logs[active.postId + "|" + active.groupId];
      if (l && panel) panel.querySelectorAll("[data-st]").forEach((b) => b.classList.toggle("on", b.dataset.st === l.status));
    });
  }

  function minimize(yes) {
    hidden = yes;
    if (panel) panel.style.display = yes ? "none" : "";
    if (yes) {
      if (!pill) {
        pill = document.createElement("button");
        pill.id = "gp-pill";
        pill.textContent = "GP";
        pill.title = "Mở lại Group Poster";
        pill.addEventListener("click", () => minimize(false));
        document.documentElement.appendChild(pill);
      }
      pill.style.display = "";
    } else if (pill) pill.style.display = "none";
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function flash(msg, err) {
    const f = panel && panel.querySelector("#gp-flash");
    if (!f) return;
    f.textContent = msg;
    f.className = "gp-flash show" + (err ? " err" : "");
    clearTimeout(f._t);
    f._t = setTimeout(() => { f.className = "gp-flash"; }, 6000);
  }
  function makeDraggable(box, handle) {
    let sx, sy, ox, oy, drag = false;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = box.getBoundingClientRect(); ox = r.left; oy = r.top;
      box.style.right = "auto"; box.style.bottom = "auto";
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!drag) return;
      box.style.left = Math.max(0, ox + e.clientX - sx) + "px";
      box.style.top = Math.max(0, oy + e.clientY - sy) + "px";
    });
    document.addEventListener("mouseup", () => { drag = false; });
  }

  function remove() {
    if (panel) { panel.remove(); panel = null; }
    if (pill) { pill.remove(); pill = null; }
  }
  function sync(a) {
    const fresh = a && Date.now() - a.ts < MAX_AGE;
    if (!fresh || !onGroupPage()) { remove(); return; }
    const changed = !active || active.ts !== a.ts;
    active = a;
    if (changed) { images = null; copyIdx = 0; }
    if (changed || !panel) render();
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === "local" && ch.active) sync(ch.active.newValue);
  });
  chrome.storage.local.get("active").then(({ active: a }) => sync(a));

  /* ---------- đọc thông tin group trên trang (thành viên, riêng tư, tình trạng tham gia) ---------- */
  function parseCount(s) {
    s = String(s || "").trim().toLowerCase();
    const m = s.match(/^([\d.,]+)\s*(k|n|nghìn|ngàn|m|tr|triệu)?$/);
    if (!m) return 0;
    if (m[2]) {
      let v = parseFloat(m[1].replace(/\./g, "").replace(",", "."));
      if (m[1].includes(".") && !m[1].includes(",")) v = parseFloat(m[1]);
      return Math.round(v * (/^(k|n|nghìn|ngàn)$/.test(m[2]) ? 1e3 : 1e6));
    }
    return parseInt(m[1].replace(/[.,]/g, ""), 10) || 0;
  }
  function readGroupInfo() {
    const main = document.querySelector('[role="main"]') || document.body;
    const text = (main.innerText || "").slice(0, 6000);
    const info = { url: location.href };
    if (/Nội dung này hiện không hiển thị|This content isn.t available|Trang này không hiển thị/i.test(text)) { info.status = "link_loi"; return info; }
    const m = text.match(/(Nhóm\s+(Công khai|Riêng tư)|(Public|Private)\s+group)\s*[·•]\s*([\d.,]+\s*(?:K|N|M|nghìn|ngàn|triệu|tr)?)\s*(thành viên|members)/i)
      || text.match(/([\d.,]+\s*(?:K|N|M|nghìn|ngàn|triệu|tr)?)\s*(thành viên|members)/i);
    if (m) {
      const num = m.length > 4 && m[4] ? m[4] : m[1];
      info.members = parseCount(num);
      if (m[2] && /công khai/i.test(m[2]) || m[3] && /public/i.test(m[3])) info.privacy = "cong_khai";
      else if (m[2] && /riêng tư/i.test(m[2]) || m[3] && /private/i.test(m[3])) info.privacy = "rieng_tu";
    }
    const btns = [...document.querySelectorAll('[role="button"], [aria-label]')].slice(0, 400)
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim()).filter((t) => t && t.length < 40);
    const has = (re) => btns.some((t) => re.test(t));
    if (has(/^(Đã tham gia|Joined)$/i)) info.status = "san_sang";
    else if (has(/^(Hủy yêu cầu|Huỷ yêu cầu|Đã gửi yêu cầu|Cancel request|Requested)/i)) info.status = "cho_duyet_tham_gia";
    else if (has(/^(Tham gia nhóm|Join group|Join Group)$/i)) info.status = "chua_tham_gia";
    return info;
  }
  let reportedPath = "";
  function reportInfo() {
    if (!onGroupPage()) return;
    const base = location.pathname.split("/").slice(0, 3).join("/");
    if (reportedPath === base) return;
    const info = readGroupInfo();
    if (!info.members && !info.status) return; // trang chưa tải xong, thử lại sau
    reportedPath = base;
    try { chrome.runtime.sendMessage(Object.assign({ type: "groupInfo" }, info)); } catch (e) {}
  }
  [2500, 5000, 9000].forEach((t) => setTimeout(reportInfo, t));

  // Facebook là SPA: theo dõi đổi trang để ẩn/hiện bảng nổi
  let lastPath = location.pathname;
  setInterval(() => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    chrome.storage.local.get("active").then(({ active: a }) => sync(a));
    [2500, 5000].forEach((t) => setTimeout(reportInfo, t));
  }, 1000);
})();
