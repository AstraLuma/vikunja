import {onBeforeUnmount, shallowRef, watch, type Ref, type ShallowRef} from 'vue'
import type {Editor} from '@tiptap/vue-3'

type EditorStateSnapshot = Record<string, boolean>

function isSameSnapshot(a: EditorStateSnapshot, b: EditorStateSnapshot) {
	const keys = Object.keys(a)
	return keys.length === Object.keys(b).length && keys.every(key => a[key] === b[key])
}

/**
 * Derives toolbar state (isActive/can) from the editor outside of render.
 *
 * Reading `editor.isActive()` in a template subscribes the component to the editor's
 * reactive state, which re-renders every toolbar button on each keystroke. That is
 * noticeably slow on low-end phones. Here the selector runs once per animation frame
 * after a transaction and the snapshot is only replaced when a value actually changed,
 * so plain typing causes no re-render at all.
 */
export function useEditorState(
	editor: Ref<Editor | undefined> | (() => Editor | undefined),
	selector: (editor: Editor) => EditorStateSnapshot,
): {state: ShallowRef<EditorStateSnapshot>, refresh: () => void} {
	const getEditor = typeof editor === 'function' ? editor : () => editor.value
	const state = shallowRef<EditorStateSnapshot>({})
	let frame: number | null = null

	function refresh() {
		const instance = getEditor()
		if (!instance || instance.isDestroyed) {
			return
		}

		const next = selector(instance)
		if (!isSameSnapshot(state.value, next)) {
			state.value = next
		}
	}

	function scheduleRefresh() {
		if (frame !== null) {
			return
		}

		frame = requestAnimationFrame(() => {
			frame = null
			refresh()
		})
	}

	watch(getEditor, (instance, _, onCleanup) => {
		if (!instance) {
			return
		}

		instance.on('transaction', scheduleRefresh)
		instance.on('focus', scheduleRefresh)
		instance.on('blur', scheduleRefresh)
		onCleanup(() => {
			instance.off('transaction', scheduleRefresh)
			instance.off('focus', scheduleRefresh)
			instance.off('blur', scheduleRefresh)
		})
		refresh()
	}, {immediate: true})

	onBeforeUnmount(() => {
		if (frame !== null) {
			cancelAnimationFrame(frame)
			frame = null
		}
	})

	return {state, refresh}
}
