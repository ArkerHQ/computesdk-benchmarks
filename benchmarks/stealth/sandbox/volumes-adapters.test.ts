import assert from 'node:assert/strict';
import test from 'node:test';
import { getVolumeAdapter } from './volumes-adapters.js';

test('Arker volumes use the unified SDK lifecycle and create-time mount', async () => {
  const adapter = getVolumeAdapter('arker');
  assert.ok(adapter);
  assert.equal(adapter.storageClass, 'object');
  assert.equal(adapter.mountStyle, 'create');
  const calls: unknown[] = [];
  const sandbox = { id: 'vm-test' };
  const compute = {
    volume: {
      create: async (options: unknown) => { calls.push(options); return { id: 'fs-test', name: 'test' }; },
      delete: async (id: string) => { calls.push(id); },
    },
    sandbox: {
      create: async (options: unknown) => { calls.push(options); return sandbox; },
    },
  };
  const volume = await adapter.createVolume('test', '/mnt/test', compute);
  const result = await adapter.createMounted({ compute, volume, mountPath: '/mnt/test' });
  assert.equal(result.sandbox, sandbox);
  await adapter.destroyVolume(volume, compute);
  assert.deepEqual(calls, [
    { name: 'test' },
    { volumes: [{ volume, mountPath: '/mnt/test' }] },
    'fs-test',
  ]);
});
