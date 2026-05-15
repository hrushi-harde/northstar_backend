const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const prisma = require('../db/prisma');
const { authenticate } = require('../middleware/auth');
const { validate }     = require('../middleware/validate');

// POST /api/auth/login
router.post('/login',
  validate({
    email:    { required: true, type: 'string', email: true },
    password: { required: true, type: 'string', minLength: 8 },
  }),
  async (req, res) => {
    try {
      const { email, password } = req.body;
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
      });

      if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign(
        { sub: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

      const { password: _, ...safeUser } = user;
      res.json({ token, user: safeUser });
    } catch (err) {
      console.error('[auth/login]', err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout  (stateless JWT — client drops the token)
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
