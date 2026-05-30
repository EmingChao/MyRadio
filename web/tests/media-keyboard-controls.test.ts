import assert from 'node:assert/strict'
import { isTypingTarget, resolveKeyboardPlayerAction } from '../src/composables/media-keyboard-controls'

assert.equal(resolveKeyboardPlayerAction({ code: 'Space', target: null }), 'toggle')
assert.equal(resolveKeyboardPlayerAction({ code: 'ArrowRight', target: null }), 'next')
assert.equal(resolveKeyboardPlayerAction({ code: 'ArrowLeft', target: null }), 'prev')
assert.equal(resolveKeyboardPlayerAction({ code: 'KeyA', target: null }), null)

const input = { tagName: 'INPUT', isContentEditable: false } as HTMLElement
const textarea = { tagName: 'TEXTAREA', isContentEditable: false } as HTMLElement
const editable = { tagName: 'DIV', isContentEditable: true } as HTMLElement

assert.equal(isTypingTarget(input), true)
assert.equal(isTypingTarget(textarea), true)
assert.equal(isTypingTarget(editable), true)
assert.equal(resolveKeyboardPlayerAction({ code: 'Space', target: input }), null)

console.log('media-keyboard-controls tests passed')
