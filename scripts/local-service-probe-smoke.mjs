import assert from 'node:assert/strict';
import http from 'node:http';
import { probeLocalService } from '../dist/localServiceProbe.js';

const fixtureSecret = `secret-${'x'.repeat(16)}`;
const service = http.createServer((request, response) => {
  if (request.url === '/text') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end(`Authorization: Bearer ${fixtureSecret}`); return; }
  if (request.url === '/redirect') { response.writeHead(302, { location: '/text' }); response.end(); return; }
  if (request.url === '/large') { response.writeHead(200, { 'content-type': 'text/plain' }); response.end('x'.repeat(10000)); return; }
  if (request.url === '/trickle') { response.writeHead(200, { 'content-type': 'text/plain' }); const timer = setInterval(() => response.write('x'), 40); request.on('close', () => clearInterval(timer)); return; }
  response.end('ok');
});
await new Promise((resolve) => service.listen(0, '127.0.0.1', resolve));
const port = service.address().port;
try {
  const text = await probeLocalService({ url: `http://127.0.0.1:${port}/text` });
  assert.doesNotMatch(JSON.stringify(text), new RegExp(fixtureSecret));
  const redirect = await probeLocalService({ url: `http://127.0.0.1:${port}/redirect` });
  assert.equal(redirect.status, 302);
  assert.ok(redirect.warnings.some((warning) => warning.includes('not followed')));
  const large = await probeLocalService({ url: `http://127.0.0.1:${port}/large`, maxBodyBytes: 1000 });
  assert.equal(large.body.truncated, true);
  await assert.rejects(() => probeLocalService({ url: `http://127.0.0.1:${port}/trickle`, timeoutMs: 250 }), /timed out|total deadline/i);
  await assert.rejects(() => probeLocalService({ url: `http://user:pass@127.0.0.1:${port}/text` }), /userinfo/i);
  await assert.rejects(() => probeLocalService({ url: `https://127.0.0.1:${port}/text` }), /only http/i);
  console.log('local service probe smoke passed');
} finally {
  await new Promise((resolve) => service.close(resolve));
}
