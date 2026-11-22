import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreflightOutput } from './os-capabilities.js';

test('PTY colors do not hide preflight capability verdicts', () => {
  const output = [
    '\u001b[32mPASS\u001b[0m /dev/kvm readable+writable',
    '\u001b[33mWARN\u001b[0m missing: dockerd',
    '\u001b[31mFAIL\u001b[0m create NAT chain',
  ].join('\n');
  const parsed = parsePreflightOutput(output, 1);
  assert.equal(parsed.passCount, 1);
  assert.equal(parsed.warnCount, 1);
  assert.equal(parsed.failCount, 1);
  assert.equal(parsed.capabilities.kvm, true);
  assert.equal(parsed.capabilities.nat, false);
});

test('plain verdicts still require PASS rather than an informational mention', () => {
  const parsed = parsePreflightOutput([
    '.... /dev/kvm readable+writable',
    'WARN functional fuse-overlayfs mount works',
    'PASS /sys/fs/cgroup is writable',
  ].join('\n'), 0);
  assert.equal(parsed.capabilities.kvm, false);
  assert.equal(parsed.capabilities.fuseOverlayfs, false);
  assert.equal(parsed.capabilities.cgroupWritable, true);
});
