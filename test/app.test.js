const mockQuery = jest.fn();
jest.mock('mysql2', () => ({ createPool: () => ({ query: mockQuery }) }));
jest.mock('child_process', () => ({
  execFile: (cmd, args, opts, cb) => cb(null, `pinged ${args[2]}`),
}));

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: mockCreate } })));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');

beforeEach(() => mockQuery.mockReset());

describe('basic routes', () => {
  test('health', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('hello escapes HTML', async () => {
    const res = await request(app).get('/hello').query({ name: '<script>' });
    expect(res.text).toContain('&lt;script&gt;');
  });

  test('CORS only for allowed origins', async () => {
    const ok = await request(app).get('/health').set('Origin', 'https://allowed.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://allowed.example');
    const bad = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('database routes', () => {
  test('user uses a parameterised query', async () => {
    mockQuery.mockImplementation((q, p, cb) => cb(null, [{ name: 'a' }]));
    const res = await request(app).get('/user').query({ name: "x' OR '1'='1" });
    expect(res.body).toEqual([{ name: 'a' }]);
    expect(mockQuery.mock.calls[0][1]).toEqual(["x' OR '1'='1"]);
  });

  test('user returns 500 on db error', async () => {
    mockQuery.mockImplementation((q, p, cb) => cb(new Error('x')));
    const res = await request(app).get('/user').query({ name: 'a' });
    expect(res.status).toBe(500);
  });

  test('search', async () => {
    mockQuery.mockImplementation((q, cb) => cb(null, [{ id: 1 }]));
    const res = await request(app).get('/search').query({ q: 'pen' });
    expect(res.body).toEqual([{ id: 1 }]);
  });
});

describe('ping and file', () => {
  test('ping valid host', async () => {
    const res = await request(app).get('/ping').query({ host: 'example.com' });
    expect(res.text).toBe('pinged example.com');
  });

  test('ping rejects injection', async () => {
    const res = await request(app).get('/ping').query({ host: 'a; rm -rf /' });
    expect(res.status).toBe(400);
  });

  test('file reads inside root', async () => {
    const res = await request(app).get('/file').query({ file: 'a.txt' });
    expect(res.text).toContain('hello file');
  });

  test('file missing', async () => {
    const res = await request(app).get('/file').query({ file: 'nope.txt' });
    expect(res.status).toBe(404);
  });

  test('file traversal rejected', async () => {
    const res = await request(app).get('/file').query({ file: '../../package.json' });
    expect(res.status).toBe(400);
  });
});

describe('calc, settings, restore', () => {
  const calc = (expression) => request(app).post('/calc').send({ expression });

  test.each([
    ['1+2*3', '7'],
    ['(1+2)*3', '9'],
    ['10/4-1', '1.5'],
    ['-3+5', '2'],
    ['2-1+4', '5'],
  ])('calc %s', async (expr, out) => {
    expect((await calc(expr)).text).toBe(out);
  });

  test.each(['process.exit()', '1+', '(1+2', '1 2', ''])('calc rejects %p', async (expr) => {
    expect((await calc(expr)).status).toBe(400);
  });

  test('settings strips prototype pollution keys', async () => {
    const res = await request(app).post('/settings')
      .set('Content-Type', 'application/json')
      .send('{"a":[{"b":1}],"__proto__":{"x":1},"n":{"constructor":1,"ok":2}}');
    expect(res.body).toEqual({ a: [{ b: 1 }], n: { ok: 2 } });
    expect({}.x).toBeUndefined();
  });

  test('restore parses JSON', async () => {
    const res = await request(app).post('/restore').send({ data: '{"a":1}' });
    expect(res.body).toEqual({ a: 1 });
  });

  test('restore rejects code', async () => {
    const res = await request(app).post('/restore').send({ data: 'process.exit()' });
    expect(res.status).toBe(400);
  });

  test('run evaluates', async () => {
    const res = await request(app).post('/run').send({ code: '1+1' });
    expect(res.text).toBe('2');
  });
});

describe('auth and tokens', () => {
  test('register hashes password', async () => {
    const res = await request(app).post('/register').send({ password: 'longenough' });
    expect(res.body.hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
  });

  test('register rejects short password', async () => {
    const res = await request(app).post('/register').send({ password: 'short' });
    expect(res.status).toBe(400);
  });

  test('token and admin flow', async () => {
    const t = await request(app).get('/token');
    expect(t.body.token).toHaveLength(48);
    const ok = await request(app).get('/admin').set('Authorization', `Bearer ${t.body.jwt}`);
    expect(ok.body).toEqual({ user: 'guest' });
  });

  test('admin requires valid token', async () => {
    expect((await request(app).get('/admin')).status).toBe(401);
    const forged = jwt.sign({ user: 'x' }, 'wrong');
    expect((await request(app).get('/admin').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });
});

describe('redirect', () => {
  test('relative allowed', async () => {
    const res = await request(app).get('/redirect').query({ url: '/home' });
    expect(res.headers.location).toBe('/home');
  });

  test.each(['https://evil.example', '//evil.example', '/\\evil.example'])('rejects %s', async (url) => {
    expect((await request(app).get('/redirect').query({ url })).status).toBe(400);
  });
});

describe('summarize (AI)', () => {
  const auth = () => `Bearer ${jwt.sign({ user: 'u' }, 'test-secret')}`;

  test('returns the model summary', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'Short.' }] });
    const res = await request(app).post('/summarize').set('Authorization', auth()).send({ text: 'long text' });
    expect(res.body).toEqual({ summary: 'Short.', model: 'claude-sonnet-5-5' });
  });

  test('requires auth and text, handles failures', async () => {
    expect((await request(app).post('/summarize').send({ text: 'x' })).status).toBe(401);
    expect((await request(app).post('/summarize').set('Authorization', auth()).send({})).status).toBe(400);
    mockCreate.mockRejectedValue(new Error('down'));
    expect((await request(app).post('/summarize').set('Authorization', auth()).send({ text: 'x' })).status).toBe(502);
  });
});
