const express = require('express');
const Database = require('better-sqlite3');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'SAMMXMODZ_VIP_SECRET_2024';
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin123';

// Khởi tạo Database
const db = new Database('database.db');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, points INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS files (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, size INTEGER, file_path TEXT, image_path TEXT, points INTEGER DEFAULT 0, sale_points INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, points INTEGER, used INTEGER DEFAULT 0, used_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
`);

// Tự động thêm cột nếu database đã tồn tại từ trước (nâng cấp không mất dữ liệu)
try { db.exec("ALTER TABLE files ADD COLUMN sale_points INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE files ADD COLUMN stock INTEGER DEFAULT 0"); } catch(e) {}
try { db.exec("ALTER TABLE files ADD COLUMN image_path TEXT"); } catch(e) {}

// Cấu hình thư mục upload
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // Giới hạn 100MB

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- MIDDLEWARE XÁC THỰC ---
function authUser(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ error: 'Token lỗi' }); }
}

function authAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập admin' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Không có quyền' });
    req.admin = decoded; next();
  } catch { res.status(401).json({ error: 'Token lỗi' }); }
}

// --- API NGƯỜI DÙNG ---
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(400).json({ error: 'Username đã tồn tại' });
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, bcrypt.hashSync(password, 10));
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });
  const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username, points: user.points });
});

app.get('/api/me', authUser, (req, res) => {
  res.json(db.prepare('SELECT id, username, points FROM users WHERE id = ?').get(req.user.id));
});

app.post('/api/redeem', authUser, (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Chưa nhập code' });
  const c = db.prepare('SELECT * FROM codes WHERE code = ?').get(code.trim().toUpperCase());
  if (!c) return res.status(400).json({ error: 'Code không tồn tại' });
  if (c.used) return res.status(400).json({ error: 'Code đã dùng' });
  db.prepare('UPDATE codes SET used = 1, used_by = ? WHERE id = ?').run(req.user.username, c.id);
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(c.points, req.user.id);
  res.json({ success: true, points: db.prepare('SELECT points FROM users WHERE id = ?').get(req.user.id).points, added: c.points });
});

app.get('/api/files', (req, res) => {
  res.json(db.prepare('SELECT id, name, size, file_path, image_path, points, sale_points, stock FROM files ORDER BY id DESC').all());
});

// Mua File (Trừ điểm và trừ số lượng kho)
app.post('/api/files/buy', authUser, (req, res) => {
  const { fileId } = req.body;
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(fileId);
  if (!file) return res.status(404).json({ error: 'File không tồn tại' });
  if (file.stock <= 0) return res.status(400).json({ error: 'File này đã hết hàng!' });
  
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const finalPrice = (file.sale_points > 0 && file.sale_points < file.points) ? file.sale_points : file.points;

  if (user.points < finalPrice) return res.status(400).json({ error: `Bạn cần ${finalPrice} điểm để mua file này. Số dư hiện tại: ${user.points} điểm` });
  
  if (finalPrice > 0) {
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(finalPrice, req.user.id);
  }
  // Trừ đi 1 số lượng trong kho
  db.prepare('UPDATE files SET stock = stock - 1 WHERE id = ?').run(file.id);
  
  res.json({ success: true, file_path: file.file_path, new_points: user.points - finalPrice });
});

// --- API ADMIN ---
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(400).json({ error: 'Sai tài khoản admin' });
  res.json({ token: jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '1d' }) });
});

// Đăng file (Hỗ trợ tải file lên hoặc dán URL)
app.post('/api/admin/upload', authAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]), (req, res) => {
  const name = req.body.name;
  const points = parseInt(req.body.points) || 0;
  const sale_points = parseInt(req.body.sale_points) || 0;
  const stock = parseInt(req.body.stock) || 0;
  const fileUrl = req.body.file_url;
  
  let final_file_path = '';
  let final_size = 0;

  if (fileUrl && fileUrl.trim() !== '') {
    final_file_path = fileUrl.trim(); // Dùng Link URL
    final_size = 0; 
  } else if (req.files?.file) {
    const f = req.files.file[0];
    final_file_path = '/uploads/' + f.filename; // Dùng file tải lên
    final_size = f.size;
  } else {
    return res.status(400).json({ error: 'Vui lòng chọn file hoặc nhập URL' });
  }

  const img = req.files?.image?.[0];
  const image_path = img ? '/uploads/' + img.filename : null;

  db.prepare('INSERT INTO files (name, size, file_path, image_path, points, sale_points, stock) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, final_size, final_file_path, image_path, points, sale_points, stock);
  res.json({ success: true });
});

// Sửa File
app.put('/api/admin/files/:id', authAdmin, (req, res) => {
  const { name, points, sale_points, stock } = req.body;
  db.prepare('UPDATE files SET name = ?, points = ?, sale_points = ?, stock = ? WHERE id = ?').run(name, points, sale_points, stock, req.params.id);
  res.json({ success: true });
});

// Xóa File
app.delete('/api/admin/files/:id', authAdmin, (req, res) => {
  db.prepare('DELETE FROM files WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Tạo Code
app.post('/api/admin/codes', authAdmin, (req, res) => {
  const { points, count } = req.body;
  const n = Math.min(count || 1, 50);
  const created = [];
  const stmt = db.prepare('INSERT INTO codes (code, points) VALUES (?, ?)');
  for (let i = 0; i < n; i++) {
    let code = 'VIP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    stmt.run(code, points);
    created.push(code);
  }
  res.json({ success: true, codes: created });
});

app.get('/api/admin/codes', authAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM codes ORDER BY id DESC').all());
});

app.get('/api/admin/users', authAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, username, points FROM users ORDER BY id DESC').all());
});

// Chạy Server
app.listen(PORT, () => console.log(`✅ Server chạy thành công tại cổng ${PORT}`));
