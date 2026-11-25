process.env.JWT_SECRET = 'test-secret';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.FILE_ROOT = require('path').join(__dirname, 'fixtures');
process.env.CORS_ORIGINS = 'https://allowed.example';
