import assert from 'node:assert/strict';
import test from 'node:test';
import { OCI_PARTICIPANTS, ociUnsupportedReason, REFERENCE_IMAGE } from './oci-tti.js';

test('Arker boots the shared reference image without substituting a golden', () => {
  assert.equal(ociUnsupportedReason('arker', {}), undefined);
  assert.equal(OCI_PARTICIPANTS.arker.mechanism, 'image');
  assert.deepEqual(OCI_PARTICIPANTS.arker.resolve({}), {
    sandboxOptions: { image: REFERENCE_IMAGE }, imageRef: REFERENCE_IMAGE,
  });
});
