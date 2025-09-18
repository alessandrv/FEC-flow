process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { createServer } = require('https');
const { readFileSync } = require('fs');
const { parse } = require('url');
const next = require('next');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = process.env.PORT || 3000;

// Path to SSL certificates
const certPath = path.join(__dirname, 'certificates');
const httpsOptions = {
  key: readFileSync(path.join(certPath, 'server.key')),
  cert: readFileSync(path.join(certPath, 'server.crt')),
};

// Initialize Next.js app
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
    .listen(port, () => {
      console.log(`> Ready on https://${hostname}:${port} [${process.env.NODE_ENV}]`);
    });
});
