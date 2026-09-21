/**
 * Group Poster – Apps Script kết nối Google Sheet "Group Poster - Data" với extension.
 * Cách dùng: Tiện ích mở rộng → Apps Script → dán toàn bộ file này → đổi SECRET_KEY
 * → Triển khai → Ứng dụng web (Thực thi: Tôi · Truy cập: Bất kỳ ai) → copy URL /exec.
 */
const SECRET_KEY = 'DOI-MA-NAY-TRUOC-KHI-TRIEN-KHAI';

const TABS = {
  groups: ['id', 'ten', 'link', 'category', 'tu_khoa', 'thanh_vien', 'quyen_rieng_tu', 'tinh_trang',
           'duyet_bai', 'luat', 'ghi_chu', 'ngay_them', 'cap_nhat_luc', 'nguoi_cap_nhat'],
  categories: ['id', 'ten', 'mau'],
  logs: ['thoi_gian', 'ngay', 'bai_dang', 'group_id', 'ten_group', 'trang_thai', 'nguoi_dang']
};

/* ---------- đọc: GET ?key=...&action=pull[&since=YYYY-MM-DD] ---------- */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.key !== SECRET_KEY) return json_({ ok: false, error: 'Sai mã bí mật' });
  if (p.action === 'ping') return json_({ ok: true, sheet: SpreadsheetApp.getActive().getName() });
  const since = p.since || '';
  return json_({
    ok: true,
    serverTime: new Date().toISOString(),
    categories: readTab_('categories'),
    groups: readTab_('groups'),
    logs: readTab_('logs').filter(function (r) { return !since || String(r.ngay) >= since; })
  });
}

/* ---------- ghi: POST body JSON {key, action, rows|ids, user} ---------- */
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'JSON không hợp lệ' }); }
  if (body.key !== SECRET_KEY) return json_({ ok: false, error: 'Sai mã bí mật' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (body.action) {
      case 'upsertGroups':     return json_(upsert_('groups', body.rows || [], body.user));
      case 'deleteGroups':     return json_(remove_('groups', body.ids || []));
      case 'upsertCategories': return json_(upsert_('categories', body.rows || []));
      case 'deleteCategories': return json_(remove_('categories', body.ids || []));
      case 'appendLogs':       return json_(appendLogs_(body.rows || [], body.user));
      default:                 return json_({ ok: false, error: 'action không hỗ trợ' });
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- helpers ---------- */
function sheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(TABS[name]); sh.setFrozenRows(1); }
  return sh;
}
function readTab_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const head = values.shift() || [];
  return values
    .filter(function (r) { return r.some(function (c) { return c !== ''; }); })
    .map(function (r) {
      const o = {};
      head.forEach(function (h, i) { o[h] = r[i] instanceof Date ? r[i].toISOString() : r[i]; });
      return o;
    });
}
function upsert_(name, rows, user) {
  const sh = sheet_(name);
  const head = TABS[name];
  const data = sh.getDataRange().getValues();
  const idCol = head.indexOf('id');
  const linkCol = head.indexOf('link');
  const index = {};
  for (let i = 1; i < data.length; i++) {
    index['id:' + data[i][idCol]] = i + 1;
    if (linkCol >= 0 && data[i][linkCol]) index['link:' + slug_(data[i][linkCol])] = i + 1;
  }
  const now = new Date().toISOString();
  let added = 0, updated = 0;
  rows.forEach(function (row) {
    if (name === 'groups') {
      row.cap_nhat_luc = now;
      if (user) row.nguoi_cap_nhat = user;
      if (!row.id) row.id = 'g_' + Utilities.getUuid().slice(0, 8);
    }
    const at = index['id:' + row.id] || (row.link ? index['link:' + slug_(row.link)] : null);
    if (at) {
      const cur = sh.getRange(at, 1, 1, head.length).getValues()[0];
      const next = head.map(function (h, i) { return row[h] !== undefined ? row[h] : cur[i]; });
      sh.getRange(at, 1, 1, head.length).setValues([next]);
      updated++;
    } else {
      if (name === 'groups' && !row.ngay_them) row.ngay_them = now.slice(0, 10);
      sh.appendRow(head.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
      const r = sh.getLastRow();
      index['id:' + row.id] = r;
      if (row.link) index['link:' + slug_(row.link)] = r;
      added++;
    }
  });
  return { ok: true, added: added, updated: updated };
}
function remove_(name, ids) {
  const sh = sheet_(name);
  const data = sh.getDataRange().getValues();
  const idCol = TABS[name].indexOf('id');
  const set = {}; ids.forEach(function (id) { set[id] = true; });
  let n = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (set[data[i][idCol]]) { sh.deleteRow(i + 1); n++; }
  }
  return { ok: true, deleted: n };
}
function appendLogs_(rows, user) {
  const sh = sheet_('logs');
  const head = TABS.logs;
  const now = new Date();
  const values = rows.map(function (r) {
    r.thoi_gian = r.thoi_gian || now.toISOString();
    r.ngay = r.ngay || Utilities.formatDate(now, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    r.nguoi_dang = r.nguoi_dang || user || '';
    return head.map(function (h) { return r[h] !== undefined ? r[h] : ''; });
  });
  if (values.length) sh.getRange(sh.getLastRow() + 1, 1, values.length, head.length).setValues(values);
  return { ok: true, added: values.length };
}
function slug_(url) {
  const m = String(url).match(/groups\/([^\/?#]+)/i);
  return m ? m[1].toLowerCase() : String(url).toLowerCase();
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
