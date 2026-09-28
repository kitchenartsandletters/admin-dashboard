import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') }); // Ensure correct path resolution

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4173;
// Serves the built dashboard (dist/) with a client-side-routing fallback.
// The former /api proxy to the dashboard backend was removed: every screen calls
// its backend by absolute URL (see src/services/*/*Api.ts, src/api/*), so the
// proxy was unused, yet its required VITE_API_BASE_URL could crash startup.

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

// Catch-all to serve index.html for all other routes (for client-side routing)
app.get('/*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  console.log(`[INFO] Serving index.html for ${req.url}`);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT} — serving static files from /dist`);
});