describe('config', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; jest.resetModules(); });

  test('reads values and defaults', () => {
    const c = require('../config');
    expect(c.PORT).toBe(3000);
    expect(c.CORS_ORIGINS).toEqual(['https://allowed.example']);
  });

  test('throws when a required variable is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => require('../config')).toThrow(/JWT_SECRET/);
  });
});
