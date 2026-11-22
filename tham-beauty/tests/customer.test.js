import test from 'node:test'
import assert from 'node:assert/strict'
import { customerCode } from '../src/lib/util.js'
test('code client', () => {
  assert.equal(customerCode({ id: 'abc-123xyz', code: 'CL-2026-0001' }), 'CL-2026-0001')
  assert.equal(customerCode({ id: 'abcd-1234' }), 'C-ABCD12')
  assert.equal(customerCode(null), '')
})

import { can, effectivePerms } from '../src/lib/perms.js'
test('autorisations: ancien compte déduit, vendeur sans coûts/projets', () => {
  const old = { active: true, role: 'commercial', perms: ['sales.write', 'stock.read'] }
  assert.equal(can(old, 'projects.read'), false)
  assert.equal(can(old, 'costs.read'), false)
  assert.equal(can(old, 'dashboard.read'), true)
  assert.equal(can(old, 'customers.read'), true)
  assert.equal(can({ ...old, permsV2: true }, 'dashboard.read'), false)
  assert.equal(can({ active: true, role: 'admin' }, 'costs.read'), true)
  assert.ok(effectivePerms(old).includes('cash.close'))
  assert.ok(!effectivePerms(old).includes('users.manage'))
})
