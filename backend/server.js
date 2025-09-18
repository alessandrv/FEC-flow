const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const flowsRouter = require('./routes/flows');
const groupsRouter = require('./routes/groups');
const pool = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3006;
const HOST = process.env.HOST || '0.0.0.0'; // Listen on all network interfaces

// SSL Certificate configuration
const certPath = path.join(__dirname, 'certificates');
const httpsOptions = {
  key: fs.readFileSync(path.join(certPath, 'server.key')),
  cert: fs.readFileSync(path.join(certPath, 'server.crt')),
};

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['https://localhost:3005', 'https://172.16.16.107:3005', "https://172.16.16.27:3005"],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/flows', flowsRouter);
app.use('/api/groups', groupsRouter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

https.createServer(httpsOptions, app).listen(PORT, HOST, () => {
  console.log(`HTTPS Server running on ${HOST}:${PORT}`);
  console.log(`Health check: https://172.16.16.107:${PORT}/health`);
  console.log(`API base URL: https://172.16.16.107:${PORT}/api`);
  console.log(`Local access: https://localhost:${PORT}/api`);
}); 

// Ensure DB schema changes (idempotent)
(async () => {
  try {
    await pool.execute(
      "ALTER TABLE flow_groups ADD COLUMN IF NOT EXISTS accept_any TINYINT(1) NOT NULL DEFAULT 0"
    );
    console.log('DB check: ensured flow_groups.accept_any exists');
  } catch (err) {
    // Some MySQL versions don't support IF NOT EXISTS for ADD COLUMN; try a safer approach
    try {
      const [rows] = await pool.execute("SHOW COLUMNS FROM flow_groups LIKE 'accept_any'");
      if (!Array.isArray(rows) || rows.length === 0) {
        await pool.execute("ALTER TABLE flow_groups ADD COLUMN accept_any TINYINT(1) NOT NULL DEFAULT 0");
        console.log('DB migration: added flow_groups.accept_any');
      }
    } catch (e) {
      console.warn('DB migration check failed:', e?.message || e);
    }
  }
})();