import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseMethod, friendlyError, methodAvailable, recommendation, toBase64 } from '../src/lib/printer.js'

const caps = (o) => ({ os: 'windows', chromium: true, bt: true, usb: true, rawbt: false, share: false, dialog: true, ...o })
test('choix automatique selon appareil', () => {
  assert.equal(chooseMethod({}, caps({})), 'usb')
  assert.equal(chooseMethod({}, caps({ usb: false })), 'bt')
  assert.equal(chooseMethod({}, caps({ usb: false, bt: false })), 'dialog')
  assert.equal(chooseMethod({}, caps({ os: 'android', rawbt: true, usb: true })), 'bt')
  assert.equal(chooseMethod({}, caps({ os: 'android', rawbt: true, bt: false })), 'rawbt')
  assert.equal(chooseMethod({}, caps({ os: 'ios', bt: false, usb: false })), 'dialog')
})
test('le réglage et le dernier mode réussi priment', () => {
  assert.equal(chooseMethod({ printMethod: 'bt' }, caps({})), 'bt')
  assert.equal(chooseMethod({ printMethod: 'rawbt' }, caps({})), 'usb') // RawBT indisponible hors Android
  assert.equal(chooseMethod({ lastOk: 'bt' }, caps({})), 'bt')
  assert.equal(chooseMethod({ lastOk: 'usb' }, caps({ usb: false })), 'bt')
})
test('disponibilité, messages, base64', () => {
  assert.equal(methodAvailable('usb', caps({ usb: false })), false)
  assert.equal(methodAvailable('dialog', caps({ usb: false })), true)
  assert.match(recommendation(caps({ os: 'ios' })).title, /Apple/)
  assert.match(recommendation(caps({ os: 'android' })).lines.join(' '), /RawBT/)
  assert.match(friendlyError('bt', { name: 'NotFoundError' }), /Aucune imprimante/)
  assert.equal(toBase64(Uint8Array.from([27, 64, 72, 105])), Buffer.from([27, 64, 72, 105]).toString('base64'))
})
