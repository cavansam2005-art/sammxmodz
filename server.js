const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(cors());
app.use(express.json());

// Cấu hình lưu trữ file
const upload = multer({ dest: 'uploads/' });
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');

// Cơ sở dữ liệu tạm trên RAM
const dbUsers = {
  "SAMM X MODZ": { password: "123456", role: "admin", bio: "Chào mừng bạn đến với web của chúng tôi. AE cần gì hãy liên hệ từ bot trong app nhé. Hiện tại web của chúng tôi đang cập nhật file cho ae sài an toàn bảo mật cao nhé. Chúc ae tìm file mình thích nha!", author: "VAN SAM" }
};
const dbDevices = {}; 
const dbMods = []; 
const dbOrders = {}; 

// 1. API Ghi nhận ID Thiết bị
app.post('/api/track-device', (req, res) => {
  const { device_id } = req.body;
  if (device_id) {
    dbDevices[device_id] = { last_seen: new Date().toLocaleString('vi-VN') };
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'No device ID' });
  }
});

// 2. API Đăng nhập
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = dbUsers[username];
  if (user && user.password === password) {
    res.json({ success: true, username: username, bio: user.bio, author: user.author, role: user.role });
  } else {
    res.json({ success: false, error: 'Sai tài khoản hoặc mật khẩu!' });
  }
});

// 3. API Đăng ký
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (dbUsers[username]) return res.json({ success: false, error: 'Tài khoản đã tồn tại!' });
  dbUsers[username] = { password: password, role: "user" };
  dbOrders[username] = [];
  res.json({ success: true, message: 'Đăng ký thành công!' });
});

// 4. API Lấy danh sách Mod
app.get('/api/mods', (req, res) => {
  res.json(dbMods);
});

// 5. API Admin Upload File Mod
app.post('/api/admin/upload', upload.single('modfile'), (req, res) => {
  const { title, author } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Không có file!' });

  const newMod = {
    id: Date.now().toString(),
    title: title,
    author: author || 'VAN SAM',
    filename: req.file.originalname,
    filepath: req.file.filename,
    size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB',
    date: new Date().toLocaleString('vi-VN')
  };
  dbMods.unshift(newMod);
  res.json({ success: true, message: 'Upload thành công!', mod: newMod });
});

// 6. API Tải File
app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.query;
  const mod = dbMods.find(m => m.id === id);

  if (mod) {
    if (username && dbOrders[username]) {
      dbOrders[username].unshift({ title: mod.title, date: new Date().toLocaleString('vi-VN') });
    }
    res.download(path.join(__dirname, 'uploads', mod.filepath), mod.filename);
  } else {
    res.status(404).send('File không tồn tại!');
  }
});

// 7. API Lấy Đơn Hàng
app.get('/api/orders/:username', (req, res) => {
  res.json(dbOrders[req.params.username] || []);
});

// ==========================================
// TRANG ADMIN (GIAO DIỆN CYBERPUNK MỚI)
// ==========================================
app.get('/admin', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Admin Panel - SAMM X MOD</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <style>
        :root { --primary: #00f3ff; --secondary: #ff00ea; --bg: #05050a; --panel: rgba(20, 20, 30, 0.6); --border: rgba(255, 255, 255, 0.1); --text: #fff; --muted: #8a8a9e; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Outfit', sans-serif; }
        body { background: var(--bg); color: var(--text); display: flex; min-height: 100vh; background-image: radial-gradient(circle at 10% 20%, rgba(0, 243, 255, 0.05), transparent 30%), radial-gradient(circle at 90% 80%, rgba(255, 0, 234, 0.05), transparent 30%); }
        
        /* SIDEBAR */
        .sidebar { width: 260px; background: rgba(10, 10, 15, 0.9); backdrop-filter: blur(20px); border-right: 1px solid var(--border); padding: 30px 20px; display: flex; flex-direction: column; position: fixed; height: 100vh; }
        .logo { font-size: 22px; font-weight: 800; background: linear-gradient(90deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 40px; display: flex; align-items: center; gap: 10px; }
        .nav-item { display: flex; align-items: center; gap: 15px; padding: 15px; border-radius: 12px; color: var(--muted); font-weight: 600; cursor: pointer; margin-bottom: 10px; transition: 0.3s; }
        .nav-item:hover, .nav-item.active { background: rgba(0, 243, 255, 0.1); color: var(--primary); border-left: 3px solid var(--primary); }
        .nav-item i { font-size: 18px; width: 24px; text-align: center; }
        
        /* MAIN CONTENT */
        .main-content { margin-left: 260px; flex: 1; padding: 40px; }
        .page-title { font-size: 28px; font-weight: 800; margin-bottom: 30px; color: #fff; display: flex; align-items: center; gap: 10px; }
        .page-title i { color: var(--primary); }
        
        /* GLASS BOX */
        .glass-box { background: var(--panel); backdrop-filter: blur(15px); border: 1px solid var(--border); border-radius: 20px; padding: 30px; margin-bottom: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .glass-box h3 { margin-bottom: 20px; font-size: 18px; color: var(--primary); display: flex; align-items: center; gap: 10px; }
        
        /* FORM UPLOAD */
        .input-group { margin-bottom: 20px; }
        .input-group label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
        .input-group input[type="text"] { width: 100%; padding: 15px; border-radius: 12px; border: 1px solid var(--border); background: rgba(0,0,0,0.5); color: #fff; font-size: 15px; outline: none; transition: 0.3s; }
        .input-group input[type="text"]:focus { border-color: var(--primary); box-shadow: 0 0 15px rgba(0,243,255,0.2); }
        
        .file-drop-area { position: relative; display: flex; align-items: center; justify-content: center; flex-direction: column; padding: 40px; border: 2px dashed rgba(0, 243, 255, 0.4); border-radius: 15px; background: rgba(0, 243, 255, 0.05); cursor: pointer; transition: 0.3s; margin-bottom: 20px; }
        .file-drop-area:hover { background: rgba(0, 243, 255, 0.1); border-color: var(--primary); }
        .file-drop-area i { font-size: 40px; color: var(--primary); margin-bottom: 15px; }
        .file-drop-area span { color: var(--muted); font-size: 14px; }
        .file-drop-area input[type="file"] { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .file-name { margin-top: 10px; font-size: 13px; color: var(--primary); font-weight: 700; font-family: 'JetBrains Mono', monospace; }
        
        .btn-submit { width: 100%; padding: 16px; border-radius: 12px; border: none; background: linear-gradient(45deg, var(--secondary), var(--primary)); color: #000; font-weight: 800; font-size: 16px; cursor: pointer; transition: 0.3s; display: flex; justify-content: center; align-items: center; gap: 10px; }
        .btn-submit:hover { transform: translateY(-2px); box-shadow: 0 10px 20px rgba(255, 0, 234, 0.3); }
        
        /* TABLE */
        table { width: 100%; border-collapse: collapse; margin-top: 15px; }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid var(--border); font-size: 14px; }
        th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: rgba(255,255,255,0.02); }
        .mono { font-family: 'JetBrains Mono', monospace; color: var(--primary); font-size: 13px; }
        .badge { background: rgba(0,243,255,0.1); border: 1px solid rgba(0,243,255,0.3); color: var(--primary); padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        
        /* TABS */
        .tab-content { display: none; animation: fadeIn 0.4s ease; }
        .tab-content.active { display: block; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        @media (max-width: 768px) {
          body { flex-direction: column; }
          .sidebar { width: 100%; height: auto; position: relative; flex-direction: row; overflow-x: auto; padding: 15px; align-items: center; border-right: none; border-bottom: 1px solid var(--border); }
          .logo { margin-bottom: 0; margin-right: 20px; font-size: 18px; }
          .nav-item { margin-bottom: 0; white-space: nowrap; padding: 10px 15px; border-left: none !important; border-bottom: 3px solid transparent; }
          .nav-item.active { border-bottom-color: var(--primary); }
          .main-content { margin-left: 0; padding: 20px; }
          th, td { font-size: 12px; padding: 10px; }
        }
      </style>
    </head>
    <body>

      <div class="sidebar">
        <div class="logo"><i class="fa-solid fa-cube"></i> SAMM ADMIN</div>
        <div class="nav-item active" onclick="switchTab('upload', this)"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Mod</div>
        <div class="nav-item" onclick="switchTab('devices', this)"><i class="fa-solid fa-mobile-screen-button"></i> Thiết bị truy cập</div>
        <div class="nav-item" onclick="switchTab('mods', this)"><i class="fa-solid fa-box-open"></i> Kho File Mod</div>
      </div>

      <div class="main-content">
        
        <!-- TAB UPLOAD -->
        <div id="tab-upload" class="tab-content active">
          <div class="page-title"><i class="fa-solid fa-cloud-arrow-up"></i> Tải Lên File Mod Mới</div>
          <div class="glass-box">
            <form id="uploadForm">
              <div class="input-group">
                <label>Tên File Mod</label>
                <input type="text" id="modTitle" placeholder="VD: Mod Nhân Vật Alok VIP" required>
              </div>
              <div class="input-group">
                <label>Tác giả (Mặc định: VAN SAM)</label>
                <input type="text" id="modAuthor" placeholder="VAN SAM">
              </div>
              <div class="file-drop-area">
                <i class="fa-solid fa-file-arrow-up"></i>
                <span>Kéo thả file vào đây hoặc Bấm để chọn file</span>
                <div class="file-name" id="fileNameDisplay"></div>
                <input type="file" id="modFile" required onchange="showFileName()">
              </div>
              <button type="submit" class="btn-submit"><i class="fa-solid fa-upload"></i> BẮT ĐẦU TẢI LÊN</button>
            </form>
            <p id="uploadStatus" style="text-align: center; margin-top: 15px; font-weight: bold;"></p>
          </div>
        </div>

        <!-- TAB DEVICES -->
        <div id="tab-devices" class="tab-content">
          <div class="page-title"><i class="fa-solid fa-mobile-screen-button"></i> Danh Sách Thiết Bị Truy Cập</div>
          <div class="glass-box">
            <h3><i class="fa-solid fa-signal"></i> Tổng cộng: ${Object.keys(dbDevices).length} thiết bị</h3>
            <div style="overflow-x: auto;">
              <table>
                <thead><tr><th>ID Thiết Bị</th><th>Thời Gian Truy Cập Cuối</th></tr></thead>
                <tbody>
                  ${Object.keys(dbDevices).map(k => `<tr><td class="mono">${k}</td><td>${dbDevices[k].last_seen}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- TAB MODS -->
        <div id="tab-mods" class="tab-content">
          <div class="page-title"><i class="fa-solid fa-box-open"></i> Kho File Mod Trên Server</div>
          <div class="glass-box">
            <h3><i class="fa-solid fa-database"></i> Tổng cộng: ${dbMods.length} file</h3>
            <div style="overflow-x: auto;">
              <table>
                <thead><tr><th>Tên File</th><th>Tác giả</th><th>Dung lượng</th><th>Ngày tạo</th></tr></thead>
                <tbody>
                  ${dbMods.map(m => `<tr><td style="color: #fff; font-weight: 600;">${m.title}</td><td><span class="badge">${m.author}</span></td><td class="mono">${m.size}</td><td>${m.date}</td></tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>

      <script>
        function switchTab(tabName, el) {
          document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
          document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
          
          el.classList.add('active');
          document.getElementById('tab-' + tabName).classList.add('active');
        }

        function showFileName() {
          const input = document.getElementById('modFile');
          const display = document.getElementById('fileNameDisplay');
          if (input.files.length > 0) {
            display.innerText = "📦 " + input.files[0].name + " (" + (input.files[0].size / 1024 / 1024).toFixed(2) + " MB)";
          } else {
            display.innerText = "";
          }
        }

        document.getElementById('uploadForm').onsubmit = async (e) => {
          e.preventDefault();
          const statusEl = document.getElementById('uploadStatus');
          const btn = document.querySelector('.btn-submit');
          
          statusEl.innerText = "Đang tải file lên Server, vui lòng đợi...";
          statusEl.style.color = "var(--primary)";
          btn.disabled = true;
          btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG XỬ LÝ...';

          const formData = new FormData();
          formData.append('title', document.getElementById('modTitle').value);
          formData.append('author', document.getElementById('modAuthor').value);
          formData.append('modfile', document.getElementById('modFile').files[0]);
          
          try {
            const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
              statusEl.innerText = "Tải lên thành công! Đang làm mới trang...";
              statusEl.style.color = "#10b981";
              setTimeout(() => location.reload(), 1500);
            } else {
              statusEl.innerText = 'Lỗi: ' + data.error;
              statusEl.style.color = "#ef4444";
              btn.disabled = false;
              btn.innerHTML = '<i class="fa-solid fa-upload"></i> BẮT ĐẦU TẢI LÊN';
            }
          } catch (e) {
            statusEl.innerText = 'Lỗi kết nối đến Server!';
            statusEl.style.color = "#ef4444";
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-upload"></i> BẮT ĐẦU TẢI LÊN';
          }
        };
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log('🚀 SAMM X MOD SERVER chạy thành công!'));
