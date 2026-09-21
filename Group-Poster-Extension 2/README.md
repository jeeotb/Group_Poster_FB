# Group Poster v2.0 — Hướng dẫn cài & dùng

## 1. Cài (1 lần, ~1 phút)
1. Giải nén file zip → được thư mục **Group-Poster-Extension**. Để thư mục ở chỗ cố định (đừng xoá).
2. Chrome / Cốc Cốc / Edge → gõ `chrome://extensions` → bật **Chế độ nhà phát triển** (góc phải).
3. Bấm **Tải tiện ích đã giải nén** → chọn thư mục **Group-Poster-Extension**.
4. Bấm icon 🧩 → ghim **Group Poster**. Bấm icon **GP** → bảng mở bên phải.
   Muốn màn hình rộng: bấm **⤢ Mở rộng** trên đầu bảng.

> Nếu đang dùng bản v1: vẫn Load unpacked thư mục mới như trên, rồi gỡ bản cũ. Bài đăng soạn ở v1 cần soạn lại (v2 dùng kho dữ liệu mới).

## 2. Kết nối Google Sheet (1 lần mỗi máy)
Tab **Cài đặt** → dán:
- **Link Apps Script** (…/exec)
- **Mã bí mật** (SECRET_KEY trong Apps Script)
- **Tên người đăng** (VD: Hưng) → bấm **Lưu & kiểm tra kết nối**.
Lần đầu: nếu sheet trống, extension tự đẩy group + category trên máy lên sheet. Từ đó sheet là nguồn gốc cho cả đội.

Chấm màu trên đầu bảng: 🟢 đã đồng bộ · 🟡 đang gửi · 🔴 lỗi (rê chuột xem lý do). Bấm vào để kéo dữ liệu mới nhất.

## 3. Dùng hằng ngày
**Nội dung** → + Bài mới: tiêu đề, category, từ khóa, 1 hoặc nhiều phiên bản (`{chào|xin chào}`), kéo thả nhiều ảnh.

**Group**
- Lịch nhỏ bên trái: bấm ngày → xem bài đã đăng ngày đó (của cả đội) và lọc bảng theo ngày.
- + Thêm group · Dán nhanh (mỗi dòng `Tên | link`) · **Nhập / Xuất CSV** (file từ skill crawl → hỏi category khi nhập).
- Tick nhiều group → **Category ▾ / Từ khóa ▾** (bấm 1 lần gán, bấm lại bỏ) · ↻ Thành viên · Xoá.
- Số thành viên + tình trạng tham gia **tự cập nhật mỗi khi bạn mở group**. Nút ↻ Cập nhật thành viên sẽ mở lần lượt từng group ở tab nền (~5 giây/group).

**Đăng bài** → chọn bài → danh sách group cùng category (khớp nhiều từ khóa lên đầu) → **▶ Bắt đầu đăng** hoặc **Mở ▶**.
Trên trang group hiện bảng nổi GP: ① Mở & điền chữ → ② Chèn ảnh → bạn tự bấm **Đăng** → đánh dấu **Đã đăng / Chờ duyệt / Bỏ qua** → **Group tiếp theo →**.
Nếu tự điền/chèn ảnh không ăn: dùng **Copy chữ**, **Copy ảnh 1/N** rồi dán, hoặc **Tải ảnh về máy** rồi kéo vào.

## 4. Cập nhật bản mới
Chép đè thư mục cũ bằng thư mục mới → `chrome://extensions` → bấm ↻ trên thẻ Group Poster. Dữ liệu không mất.

## 5. Lưu ý
- Tiện ích **không bao giờ tự bấm Đăng**.
- Bài viết + ảnh lưu trên từng máy. Group, category, lịch sử đăng dùng chung qua Google Sheet.
- Nên sao lưu (Cài đặt → Sao lưu JSON) trước khi gỡ tiện ích.
