/* Group Poster v2 — background service worker */
importScripts("lib.js");

function enablePanel() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
chrome.runtime.onInstalled.addListener(() => { enablePanel(); GP.ensureDefaults(); });
chrome.runtime.onStartup.addListener(enablePanel);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handle(msg || {}, sender).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});

async function handle(msg, sender) {
  const fbTab = sender && sender.tab && /facebook\.com/i.test(sender.tab.url || "") ? sender.tab.id : null;
  switch (msg.type) {
    case "open": return openGroup(msg, fbTab);
    case "next": return next(fbTab);
    case "status": return setStatus(msg.status);
    case "images": return { ok: true, images: await loadImages(msg.ids || []) };
    case "download": return downloadImages(msg.ids || [], msg.title || "");
    case "groupInfo": return groupInfo(msg, sender);
    case "flush": return GP.flush();
    case "pull": return GP.pull();
    case "ping": {
      const { settings } = await GP.load();
      const s = Object.assign({}, settings, msg.settings || {});
      return GP.api.get(s, { action: "ping" });
    }
    case "scanStart": return scanStart(msg.ids || []);
    case "scanStop": await chrome.storage.local.set({ scan: null }); return { ok: true };
    default: return { ok: false, error: "unknown message" };
  }
}

async function loadImages(ids) {
  const out = [];
  for (const id of ids) {
    const r = await GP.idb.get(id);
    if (r && r.blob) out.push({ id, name: r.name, type: r.blob.type, dataUrl: await GP.blobToDataUrl(r.blob) });
  }
  return out;
}

async function openGroup({ postId, groupId, queue, text, variant }, preferTabId) {
  const d = await GP.load();
  const g = d.groups.find((x) => x.id === groupId);
  const p = d.posts.find((x) => x.id === postId);
  if (!g || !p) return { ok: false, error: "Không tìm thấy group hoặc bài đăng." };
  const active = {
    postId, groupId, groupName: g.name, groupUrl: g.url, groupRules: g.rules || "", approval: !!g.approval,
    postTitle: p.title || "", text: text || "", variant: variant || 0,
    variantCount: GP.variants(p).length, imageIds: p.imageIds || [], queue: queue || [], ts: Date.now()
  };
  await chrome.storage.local.set({ active });
  const tabId = await navigate(g.url, preferTabId);
  return { ok: true, tabId, groupName: g.name };
}

async function getTab(id) { if (id == null) return null; try { return await chrome.tabs.get(id); } catch (e) { return null; } }
async function navigate(url, preferTabId, background) {
  const { workTabId } = await chrome.storage.local.get("workTabId");
  let tab = (await getTab(preferTabId)) || (await getTab(workTabId));
  if (!tab) {
    const [act] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (act && /facebook\.com/i.test(act.url || "")) tab = act;
  }
  if (tab) {
    await chrome.tabs.update(tab.id, background ? { url } : { url, active: true });
    if (!background) { try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {} }
  } else {
    tab = await chrome.tabs.create({ url, active: !background });
  }
  await chrome.storage.local.set({ workTabId: tab.id });
  return tab.id;
}

async function setStatus(status) {
  const d = await GP.load();
  const a = d.active;
  if (!a) return { ok: false, error: "Không có phiên đăng nào." };
  const key = a.postId + "|" + a.groupId;
  if (!status) delete d.logs[key];
  else d.logs[key] = { status, ts: Date.now(), variant: a.variant };
  const now = Date.now();
  const history = d.history.filter((h) => !(h.local && h.postId === a.postId && h.groupId === a.groupId && h.date === GP.dayKey(now)));
  if (status) history.push({ id: GP.uid("h_"), ts: now, date: GP.dayKey(now), postId: a.postId, postTitle: a.postTitle, groupId: a.groupId, groupName: a.groupName, status, user: d.settings.userName || "", local: true });
  await chrome.storage.local.set({ logs: d.logs, history: history.slice(-5000) });
  if (status) {
    await GP.enqueue({ action: "appendLogs", rows: [{ thoi_gian: new Date(now).toISOString(), ngay: GP.dayKey(now), bai_dang: a.postTitle, group_id: a.groupId, ten_group: a.groupName, trang_thai: status, nguoi_dang: d.settings.userName || "" }] });
    GP.flush();
  }
  return { ok: true };
}

async function next(tabId) {
  const d = await GP.load();
  const a = d.active;
  if (!a) return { ok: false, error: "Không có phiên đăng nào." };
  const p = d.posts.find((x) => x.id === a.postId);
  if (!p) return { ok: false, error: "Bài đăng đã bị xoá." };
  const q = a.queue || [];
  for (let j = q.indexOf(a.groupId) + 1; j < q.length; j++) {
    const log = d.logs[a.postId + "|" + q[j]];
    if (log && log.status !== "error" && log.status !== "skipped") continue;
    if (!d.groups.find((x) => x.id === q[j])) continue;
    const { text, variant } = GP.buildText(p, d.logs);
    return openGroup({ postId: a.postId, groupId: q[j], queue: q, text, variant }, tabId);
  }
  return { ok: false, error: "Đã hết group chưa đăng trong danh sách." };
}

async function downloadImages(ids, title) {
  const imgs = await loadImages(ids);
  let i = 0;
  for (const im of imgs) {
    i++;
    const ext = (im.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    await chrome.downloads.download({
      url: im.dataUrl, conflictAction: "uniquify", saveAs: false,
      filename: `GroupPoster/${GP.safeName(title)}/${String(i).padStart(2, "0")}-${GP.safeName((im.name || "anh").replace(/\.[a-z0-9]+$/i, ""))}.${ext}`
    });
  }
  return { ok: true, count: imgs.length };
}

/* bảng nổi báo thông tin group đọc được trên trang → cập nhật + đẩy lên sheet */
async function groupInfo(msg, sender) {
  const d = await GP.load();
  const key = GP.groupKey(msg.url);
  const g = d.groups.find((x) => GP.groupKey(x.url) === key);
  let res = { ok: true, matched: !!g };
  if (g) {
    const upd = {};
    if (msg.members && msg.members !== g.members) upd.members = msg.members;
    if (msg.privacy && msg.privacy !== g.privacy) upd.privacy = msg.privacy;
    if (msg.status && msg.status !== g.status) upd.status = msg.status;
    upd.memUpd = Date.now();
    Object.assign(g, upd);
    await chrome.storage.local.set({ groups: d.groups });
    if (upd.members || upd.privacy || upd.status) {
      await GP.enqueue({ action: "upsertGroups", rows: [GP.groupToRow(g, d.categories)] });
      GP.flush();
    }
    res.updated = Object.keys(upd);
  }
  // quét hàng loạt: chuyển sang group kế tiếp
  const scan = d.scan;
  if (scan && sender && sender.tab && sender.tab.id === scan.tabId) {
    const cur = d.groups.find((x) => x.id === scan.ids[scan.idx]);
    if (cur && GP.groupKey(cur.url) === key) setTimeout(() => scanStep(scan.idx + 1), 4000 + Math.random() * 2000);
  }
  return res;
}
async function scanStart(ids) {
  if (!ids.length) return { ok: false };
  await chrome.storage.local.set({ scan: { ids, idx: -1, tabId: null, startedAt: Date.now() } });
  scanStep(0);
  return { ok: true };
}
async function scanStep(idx) {
  const d = await GP.load();
  const scan = d.scan;
  if (!scan) return;
  if (idx >= scan.ids.length) { await chrome.storage.local.set({ scan: null }); return; }
  const g = d.groups.find((x) => x.id === scan.ids[idx]);
  if (!g) return scanStep(idx + 1);
  const tabId = await navigate(g.url, scan.tabId, true);
  await chrome.storage.local.set({ scan: Object.assign(scan, { idx, tabId, at: Date.now() }) });
  // không đọc được sau 20 giây thì bỏ qua
  setTimeout(async () => {
    const s = (await chrome.storage.local.get("scan")).scan;
    if (s && s.idx === idx && Date.now() - s.at >= 19000) scanStep(idx + 1);
  }, 20000);
}
