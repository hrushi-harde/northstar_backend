const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      let value = req.body[field];

      // Trim strings before validation
      if (typeof value === 'string') {
        value = value.trim();
        req.body[field] = value;
      }

      const missing = value === undefined || value === null || value === '';
      if (rules.required && missing) {
        errors.push(`${field} is required`);
        continue;
      }
      if (missing) continue; // optional field not provided — skip remaining checks

      if (rules.type && typeof value !== rules.type) {
        errors.push(`${field} must be a ${rules.type}`);
        continue;
      }
      if (rules.email && !EMAIL_RE.test(value)) {
        errors.push(`${field} must be a valid email address`);
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
}

module.exports = { validate };
