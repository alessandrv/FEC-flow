process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { createServer } = require('https');
const { readFileSync } = require('fs');
const { parse } = require('url');
const next = require('next');
const path = require('path');

const os = require('os');
const dev = process.env.NODE_ENV !== 'production';
// Host binding. Use BIND_HOST env if set, otherwise 0.0.0.0 to expose all local interfaces.
const hostname = process.env.BIND_HOST || '0.0.0.0';
const port = process.env.PORT || 3005;

// Path to SSL certificates
const certPath = path.join(__dirname, 'certificates');
const httpsOptions = {
  key: readFileSync(path.join(certPath, 'server.key')),
  cert: readFileSync(path.join(certPath, 'server.crt')),
};

// Initialize Next.js app (Next.js expects a hostname mainly for SSR; we still pass it)
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(httpsOptions, async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      // Enumerate local interface addresses
      const nets = os.networkInterfaces();
      const addrs = [];
      for (const name of Object.keys(nets)) {
        for (const net of nets[name] || []) {
          if (net.family === 'IPv4' && !net.internal) {
            addrs.push(net.address);
          }
        }
      }
      const unique = Array.from(new Set(addrs));
      console.log('\n> Server ready (', process.env.NODE_ENV, ')');
      console.log(`> Bound on https://${hostname === '0.0.0.0' ? '0.0.0.0' : hostname}:${port}`);
      console.log('> Accessible URLs:');
      console.log(`   - https://localhost:${port}`);
      unique.forEach(ip => console.log(`   - https://${ip}:${port}`));
      console.log('\nNote: Ensure each IP you access is present in certificates/server.conf subjectAltName list.');
    });
});
