import test from 'node:test'
import assert from 'node:assert/strict'
import { customerCode } from '../src/lib/util.js'
test('code client', () => {
  assert.equal(customerCode({ id: 'abc-123xyz', code: 'CL-2026-0001' }), 'CL-2026-0001')
  assert.equal(customerCode({ id: 'abcd-1234' }), 'C-ABCD12')
  assert.equal(customerCode(null), '')
})
