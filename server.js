const express = require('express');
const { Pool } = require('pg');
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

// ====== CẤU HÌNH DATABASE SUPABASE CỦA BẠN ======
const DATABASE_URL = 'postgresql://postgres:SamKwjff123@db.sfzamacyheooutadwjlj.supabase.co:5432/postgres';
// ===============================================

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Khởi tạo bảng tự động
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT UNIQUE, password TEXT, points INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS files (id SERIAL PRIMARY KEY, name TEXT, size INTEGER, file_path TEXT, image_path TEXT, points INTEGER DEFAULT 0, sale_points INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS codes (id SERIAL PRIMARY KEY, code TEXT UNIQUE, points INTEGER, used INTEGER DEFAULT 0, used_by TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    `);
    console.log('✅ Kết nối Database Supabase thành công!');
  } catch (err) {
    console.error('❌ Lỗi khởi tạo DB:', err);
  }
}
initDB();

// Cấu hình thư mục upload tạm thời (File sẽ lưu trên ổ cứng Render, nhưng Tài khoản/Điểm thì lưu vĩnh viễn)
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '_' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MIDDLEWARE XÁC THỰC
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

// ===== API NGƯỜI DÙNG =====
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Thiếu thông tin' });
  try {
    const exists = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (exists.rows.length > 0) return res.status(400).json({ error: 'Username đã tồn tại' });
    const hash = bcrypt.hashSync(password, 10);
    await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hash]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ error: 'Sai tài khoản hoặc mật khẩu' });
    const token = jwt.sign({ id: user.id, username: user.username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: user.username, points: user.points });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/me', authUser, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, points FROM users WHERE id = $1', [req.user.id]);
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/redeem', authUser, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Chưa nhập code' });
  try {
    const cResult = await pool.query('SELECT * FROM codes WHERE code = $1', [code.trim().toUpperCase()]);
    const c = cResult.rows[0];
    if (!c) return res.status(400).json({ error: 'Code không tồn tại' });
    if (c.used) return res.status(400).json({ error: 'Code đã dùng' });
    
    await pool.query('UPDATE codes SET used = 1, used_by = $1 WHERE id = $2', [req.user.username, c.id]);
    await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [c.points, req.user.id]);
    
    const updated = await pool.query('SELECT points FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, points: updated.rows[0].points, added: c.points });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// ===== API FILE =====
app.get('/api/files', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, size, file_path, image_path, points, sale_points, stock FROM files ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.post('/api/files/buy', authUser, async (req, res) => {
  const { fileId } = req.body;
  try {
    const fResult = await pool.query('SELECT * FROM files WHERE id = $1', [fileId]);
    const file = fResult.rows[0];
    if (!file) return res.status(404).json({ error: 'File không tồn tại' });
    if (file.stock <= 0) return res.status(400).json({ error: 'File này đã hết hàng!' });
    
    const uResult = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = uResult.rows[0];
    const finalPrice = (file.sale_points > 0 && file.sale_points < file.points) ? file.sale_points : file.points;

    if (user.points < finalPrice) return res.status(400).json({ error: `Bạn cần ${finalPrice} điểm. Số dư: ${user.points} điểm` });
    
    if (finalPrice > 0) {
      await pool.query('UPDATE users SET points = points - $1 WHERE id = $2', [finalPrice, req.user.id]);
    }
    await pool.query('UPDATE files SET stock = stock - 1 WHERE id = $1', [file.id]);
    
    res.json({ success: true, file_path: file.file_path, new_points: user.points - finalPrice });
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

// ===== API ADMIN =====
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== ADMIN_USER || password !== ADMIN_PASS) return res.status(400).json({ error: 'Sai tài khoản admin' });
  res.json({ token: jwt.sign({ role: 'admin', username }, JWT_SECRET, { expiresIn: '1d' }) });
});

app.post('/api/admin/upload', authAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  const name = req.body.name;
  const points = parseInt(req.body.points) || 0;
  const sale_points = parseInt(req.body.sale_points) || 0;
  const stock = parseInt(req.body.stock) || 0;
  const fileUrl = req.body.file_url;
  
  let final_file_path = '';
  let final_size = 0;

  if (fileUrl && fileUrl.trim() !== '') {
    final_file_path = fileUrl.trim();
  } else if (req.files?.file) {
    const f = req.files.file[0];
    final_file_path = '/uploads/' + f.filename;
    final_size = f.size;
  } else {
    return res.status(400).json({ error: 'Vui lòng chọn file hoặc nhập URL' });
  }

  const img = req.files?.image?.[0];
  const image_path = img ? '/uploads/' + img.filename : null;

  try {
    await pool.query(
      'INSERT INTO files (name, size, file_path, image_path, points, sale_points, stock) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [name, final_size, final_file_path, image_path, points, sale_points, stock]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi lưu file' }); }
});

app.put('/api/admin/files/:id', authAdmin, async (req, res) => {
  const { name, points, sale_points, stock } = req.body;
  try {
    await pool.query('UPDATE files SET name = $1, points = $2, sale_points = $3, stock = $4 WHERE id = $5', [name, points, sale_points, stock, req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi cập nhật' }); }
});

app.delete('/api/admin/files/:id', authAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM files WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Lỗi xóa' }); }
});

app.post('/api/admin/codes', authAdmin, async (req, res) => {
  const { points, count } = req.body;
  const n = Math.min(count || 1, 50);
  const created = [];
  try {
    for (let i = 0; i < n; i++) {
      let code = 'VIP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      await pool.query('INSERT INTO codes (code, points) VALUES ($1, $2)', [code, points]);
      created.push(code);
    }
    res.json({ success: true, codes: created });
  } catch (err) { res.status(500).json({ error: 'Lỗi tạo code' }); }
});

app.get('/api/admin/codes', authAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM codes ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.get('/api/admin/users', authAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, points FROM users ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Lỗi server' }); }
});

app.listen(PORT, () => console.log(`✅ Server đang chạy tại cổng ${PORT}`));
