// ============================================================================
// BHOOKH — Authentication & Role-Based Authorization Middleware
// ============================================================================

const config = require('../config/config');
const db = require('../models/database');
const crypto = require('crypto');

// Lightweight self-contained JWT implementation using Node.js crypto
// Guaranteeing zero-failure token signing/verification in any environment
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + (7 * 86400) })).toString('base64url');
  const signature = crypto.createHmac('sha256', config.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSig = crypto.createHmac('sha256', config.JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (signature !== expectedSig) return null;
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required. No token provided.' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ success: false, message: 'Invalid or expired session token.' });
  }

  const user = db.findUserById(decoded.user_id);
  if (!user || user.status !== 'active') {
    return res.status(403).json({ success: false, message: 'User account is deactivated or not found.' });
  }

  req.user = {
    user_id: user.user_id,
    full_name: user.full_name,
    email: user.email,
    role_id: user.role_id,
    role_name: user.role_id === 1 ? 'super_admin' : (user.role_id === 2 ? 'restaurant_admin' : 'customer')
  };

  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role_id !== 1) {
    return res.status(403).json({ success: false, message: 'Access denied. Super Administrator privileges required.' });
  }
  next();
}

function requireRestaurantAdmin(req, res, next) {
  if (!req.user || (req.user.role_id !== 1 && req.user.role_id !== 2)) {
    return res.status(403).json({ success: false, message: 'Access denied. Restaurant Administrator privileges required.' });
  }
  next();
}

module.exports = {
  signToken,
  verifyToken,
  authenticateToken,
  requireSuperAdmin,
  requireRestaurantAdmin
};
