import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // Ensure correct path resolution

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;
const VITE_API_BASE_URL = process.env.VITE_API_BASE_URL; // Get directly, will validate

// Validate VITE_API_BASE_URL early
if (!VITE_API_BASE_URL) {
  console.error('❌ ERROR: VITE_API_BASE_URL is not set in your .env file.');
  process.exit(1);
}

try {
  new URL(VITE_API_BASE_URL); // Validate if it's a valid URL format
} catch (err) {
  console.error(`❌ ERROR: Invalid VITE_API_BASE_URL "${VITE_API_BASE_URL}". Please ensure it's a valid URL.`);
  console.error('[DETAILS]', err.message);
  process.exit(1);
}

// Log the resolved VITE_API_BASE_URL for debugging
console.log(`[INFO] Resolved VITE_API_BASE_URL: ${VITE_API_BASE_URL}`);


// Scoped Basic authentication middleware
// app.use((req, res, next) => {
//  const isApiRoute = req.path.startsWith('/api');
//  if (isApiRoute) return next(); // 🔓 Skip auth for API routes

//  const auth = { login: process.env.ADMIN_USER, password: process.env.ADMIN_PASS };

//  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
//  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

//  if (login === auth.login && password === auth.password) return next();

//  res.set('WWW-Authenticate', 'Basic realm="admin"');
//  res.status(401).send('Authentication required.');
//});

// Serve static files from the 'dist' directory
app.use(express.static(path.resolve(__dirname, 'dist')));
console.log(`[INFO] Serving static files from: ${path.resolve(__dirname, 'dist')}`);

try {
  const apiProxy = createProxyMiddleware({
    target: VITE_API_BASE_URL,
    changeOrigin: true,
    // Using a function for pathRewrite for more explicit control and debugging
    pathRewrite: function (path, req) {
      const newPath = path.replace(/^\/api/, '');
      console.log(`[PROXY REWRITE] Original path: ${path} -> Rewritten path: ${newPath}`);
      return newPath;
    },
    logLevel: 'debug', // Keep debug level for detailed proxy logs
    onProxyReq: (proxyReq, req, res) => {
      console.log(`[PROXY REQ] Proxying ${req.method} ${req.originalUrl} to ${proxyReq.protocol}//${proxyReq.host}${proxyReq.path}`);
    },
    onError: (err, req, res, target) => {
      console.error(`[PROXY ERROR] Proxy error for request ${req.method} ${req.originalUrl} to ${target}:`, err);
      res.status(500).send('Proxy error');
    }
  });

  app.use('/api', apiProxy);
  console.log('[INFO] Proxy initialized for /api with target:', VITE_API_BASE_URL);
} catch (err) {
  console.error('[PROXY INIT ERROR] Failed to initialize proxy:', err.message);
  // Log the full error stack for more context if it's not a URL validation issue
  console.error('[DETAILS]', err);
  process.exit(1);
}

// Catch-all to serve index.html for all other routes (for client-side routing)
app.get('/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  console.log(`[INFO] Serving index.html for ${req.url}`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} — serving static files from /dist`);
});