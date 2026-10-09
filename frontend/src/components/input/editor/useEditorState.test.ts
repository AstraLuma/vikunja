import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {defineComponent, h, nextTick, ref, type Ref} from 'vue'
import {mount} from '@vue/test-utils'
import type {Editor} from '@tiptap/vue-3'

import {useEditorState} from './useEditorState'

type Handler = () => void

/**
 * Just enough of the editor to drive useEditorState: the events it subscribes to and a
 * mutable set of active marks the selector reads.
 */
function createFakeEditor() {
	const handlers: Record<string, Handler[]> = {}
	const active = new Set<string>()

	return {
		active,
		isDestroyed: false,
		on(event: string, handler: Handler) {
			(handlers[event] ??= []).push(handler)
		},
		off(event: string, handler: Handler) {
			handlers[event] = (handlers[event] ?? []).filter(h => h !== handler)
		},
		emit(event: string) {
			(handlers[event] ?? []).forEach(handler => handler())
		},
		handlerCount(event: string) {
			return (handlers[event] ?? []).length
		},
		isActive(name: string) {
			return active.has(name)
		},
	}
}

type FakeEditor = ReturnType<typeof createFakeEditor>

let frames: Handler[] = []

beforeEach(() => {
	frames = []
	vi.stubGlobal('requestAnimationFrame', (callback: Handler) => {
		frames.push(callback)
		return frames.length
	})
	vi.stubGlobal('cancelAnimationFrame', () => {})
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function runFrames() {
	const pending = frames
	frames = []
	pending.forEach(callback => callback())
}

function mountWithState(editor: Ref<FakeEditor | undefined>) {
	const selector = vi.fn((instance: Editor) => ({
		bold: instance.isActive('bold'),
		italic: instance.isActive('italic'),
	}))

	let state: ReturnType<typeof useEditorState>['state'] | undefined
	const wrapper = mount(defineComponent({
		setup() {
			state = useEditorState(editor as unknown as Ref<Editor | undefined>, selector).state
			return () => h('div')
		},
	}))

	return {wrapper, selector, state: state!}
}

describe('useEditorState', () => {
	it('reads the initial state without waiting for a frame', () => {
		const editor = createFakeEditor()
		editor.active.add('bold')

		const {state} = mountWithState(ref(editor))

		expect(state.value).toEqual({bold: true, italic: false})
	})

	it('keeps the same snapshot object when a transaction changes nothing', () => {
		const editor = createFakeEditor()
		const {state} = mountWithState(ref(editor))
		const before = state.value

		editor.emit('transaction')
		runFrames()

		// Identity matters: a new object would re-render every toolbar button.
		expect(state.value).toBe(before)
	})

	it('replaces the snapshot when a value changes', () => {
		const editor = createFakeEditor()
		const {state} = mountWithState(ref(editor))
		const before = state.value

		editor.active.add('italic')
		editor.emit('transaction')
		runFrames()

		expect(state.value).not.toBe(before)
		expect(state.value).toEqual({bold: false, italic: true})
	})

	it('runs the selector once for a burst of transactions', () => {
		const editor = createFakeEditor()
		const {selector} = mountWithState(ref(editor))
		selector.mockClear()

		editor.emit('transaction')
		editor.emit('transaction')
		editor.emit('transaction')
		expect(selector).not.toHaveBeenCalled()

		runFrames()
		expect(selector).toHaveBeenCalledTimes(1)
	})

	it('also refreshes on focus and blur', () => {
		const editor = createFakeEditor()
		const {state} = mountWithState(ref(editor))

		editor.active.add('bold')
		editor.emit('blur')
		runFrames()

		expect(state.value).toEqual({bold: true, italic: false})
	})

	it('skips a refresh scheduled before the editor was destroyed', () => {
		const editor = createFakeEditor()
		const {state} = mountWithState(ref(editor))
		const before = state.value

		editor.active.add('bold')
		editor.emit('transaction')
		editor.isDestroyed = true
		runFrames()

		expect(state.value).toBe(before)
	})

	it('picks up a lazily created editor', async () => {
		const editor = ref<FakeEditor | undefined>(undefined)
		const {state} = mountWithState(editor)

		expect(state.value).toEqual({})

		const instance = createFakeEditor()
		instance.active.add('bold')
		editor.value = instance
		await nextTick()

		expect(state.value).toEqual({bold: true, italic: false})
	})

	it('unsubscribes when the component unmounts', () => {
		const editor = createFakeEditor()
		const {wrapper} = mountWithState(ref(editor))

		expect(editor.handlerCount('transaction')).toBe(1)

		wrapper.unmount()

		expect(editor.handlerCount('transaction')).toBe(0)
		expect(editor.handlerCount('focus')).toBe(0)
		expect(editor.handlerCount('blur')).toBe(0)
	})
})
