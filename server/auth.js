// Team-account authentication (admin/editor/creator) - not the consumer-
// facing login discussed separately (see claude/todo.md's "User accounts
// / login" items). Passwords are hashed with bcrypt, never stored or
// logged in plain text. Sessions are stateless JWTs carrying { sub, email,
// role }, verified on every request rather than looked up in a session
// store - simplest option for a team this size, and behaves identically
// whether the caller is the web client or a future Capacitor app (see the
// JWT-in-Authorization-header discussion in claude/todo.md).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not set - add it to server/.env (see .env.example)');
}

// 30 days: a small trusted team, not worth forcing frequent re-logins for.
const TOKEN_TTL = '30d';

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function readToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Attaches req.user when a valid token is present, but never blocks the
// request either way - used globally so the same GET endpoints serve both
// the public site (req.user undefined -> published only) and the team's
// own editing UI (req.user set -> everything, per claude/todo.md's "Draft
// visibility" decision: any logged-in role sees every status).
function optionalAuth(req, res, next) {
  const payload = readToken(req);
  if (payload) {
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
  }
  next();
}

// Blocks the request unless a valid token is present.
function requireAuth(req, res, next) {
  const payload = readToken(req);
  if (!payload) {
    return res.status(401).json({ error: 'Login required' });
  }
  req.user = { id: payload.sub, email: payload.email, role: payload.role };
  next();
}

// Blocks the request unless req.user's role is one of `roles`. Use after
// requireAuth (needs req.user already set).
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Not allowed for your role' });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, signToken, optionalAuth, requireAuth, requireRole };
