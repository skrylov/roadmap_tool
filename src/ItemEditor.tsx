import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { itemColors, limits, validateDraft, type DraftErrors, type ItemDraft, type ItemValues } from './itemDraft';
import { categories } from './prototypeItems';

type Props = {
  draft: ItemDraft;
  session: number;
  editing: boolean;
  another: boolean;
  includeWeekends: boolean;
  onChange: (draft: ItemDraft) => void;
  onAnother: (value: boolean) => void;
  onSave: (values: ItemValues) => void;
  onCancel: () => void;
  onDelete: () => void;
  confirmation: 'discard' | 'delete' | null;
  onConfirm: () => void;
  onKeepEditing: () => void;
};

export function ItemEditor(props: Props) {
  const { draft, editing, another, session, confirmation } = props;
  const editor = useRef<HTMLElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const errors: DraftErrors = submitted ? validateDraft(draft, props.includeWeekends).errors : {};

  useEffect(() => {
    setMinimized(false);
    setScheduleOpen(false);
    setSubmitted(false);
    title.current?.focus();
  }, [session]);

  useEffect(() => {
    if (!minimized) title.current?.focus();
  }, [minimized]);

  useEffect(() => {
    const node = dialog.current;
    if (confirmation && node && !node.open) node.showModal();
    if (!confirmation && node?.open) node.close();
  }, [confirmation]);

  function change<K extends keyof ItemDraft>(field: K, value: ItemDraft[K]) {
    props.onChange({ ...draft, [field]: value });
  }

  function save() {
    if (confirmation || minimized) return;
    const checked = validateDraft(draft, props.includeWeekends);
    if (Object.keys(checked.errors).length) {
      setSubmitted(true);
      if (checked.errors.schedule) setScheduleOpen(true);
      return;
    }
    props.onSave(checked.values);
  }

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (minimized || event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
    const rect = editor.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag.current || !editor.current) return;
    const { width, height } = editor.current.getBoundingClientRect();
    setPosition({
      x: Math.max(0, Math.min(window.innerWidth - width, event.clientX - drag.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - height, event.clientY - drag.current.y)),
    });
  }

  function feedback(field: keyof typeof limits) {
    const limit = limits[field];
    return (
      <>
        {draft[field].length >= limit * 0.8 && <small>{draft[field].length.toLocaleString()} / {limit.toLocaleString()}</small>}
        {errors[field] && <small className="editor-error" role="alert">{errors[field]}</small>}
      </>
    );
  }

  const summary = [draft.start, draft.end].filter(Boolean).join(' → ') || 'Not scheduled';
  return (
    <section ref={editor} className="item-editor" data-minimized={minimized || undefined} role="dialog" aria-labelledby="item-editor-title"
      style={position && !minimized ? { left: `clamp(0px, ${position.x}px, 100vw - min(412px, 100vw - 24px))`,
        '--editor-top': `clamp(0px, ${position.y}px, 100dvh - 145px)`,
        top: 'var(--editor-top)', right: 'auto', bottom: 'auto' } as CSSProperties : undefined}>
      <header style={{ backgroundColor: `${draft.color}55` }}
        onPointerDown={startDrag} onPointerMove={moveDrag} onLostPointerCapture={() => { drag.current = null; }}>
        <strong id="item-editor-title">{editing ? 'Edit item' : 'Add item'}</strong>
        <button type="button" aria-label={minimized ? 'Restore editor' : 'Minimize editor'}
          onClick={() => setMinimized(!minimized)}>{minimized ? '□' : '−'}</button>
        <button type="button" aria-label="Close editor" onClick={props.onCancel}>×</button>
      </header>
      <form hidden={minimized} className="item-editor-form" noValidate
        onSubmit={(event) => { event.preventDefault(); save(); }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            save();
          } else if (event.target instanceof HTMLInputElement) {
            event.preventDefault();
          }
        }}>
        <div className="item-editor-body">
          <label>Title<input ref={title} aria-label="Title" required value={draft.content} aria-invalid={Boolean(errors.content)}
            onChange={(event) => change('content', event.target.value)} />{feedback('content')}</label>
          <label>What?<textarea aria-label="What?" rows={3} value={draft.description} aria-invalid={Boolean(errors.description)}
            onChange={(event) => change('description', event.target.value)} />{feedback('description')}</label>
          <label>Why?<textarea aria-label="Why?" rows={3} value={draft.rationale} aria-invalid={Boolean(errors.rationale)}
            onChange={(event) => change('rationale', event.target.value)} />{feedback('rationale')}</label>
          <fieldset className="editor-segments"><legend>When?</legend>
            {categories.map((category) => (
              <label key={category}><input type="radio" name="item-category" checked={draft.category === category}
                onChange={() => change('category', category)} />{category}</label>
            ))}
          </fieldset>
          <details open={scheduleOpen} onToggle={(event) => setScheduleOpen(event.currentTarget.open)}>
            <summary>Schedule <small>{summary}</small></summary>
            <div className="editor-pair">
              <label>Start<input type="date" value={draft.start} onChange={(event) => change('start', event.target.value)} /></label>
              <label>Ready<input type="date" value={draft.end} onChange={(event) => change('end', event.target.value)} /></label>
            </div>
          </details>
          {(draft.start || draft.end) && (
            <button type="button" className="editor-unschedule"
              onClick={() => props.onChange({ ...draft, start: '', end: '' })}>
              Remove from timeline
            </button>
          )}
          {errors.schedule && <small className="editor-error" role="alert">{errors.schedule}</small>}
          <div className="editor-pair">
            <fieldset className="editor-segments"><legend>Size</legend>
              {(['S', 'M', 'L'] as const).map((size) => (
                <label key={size}><input type="radio" name="item-size" checked={draft.size === size}
                  onChange={() => change('size', size)} />{size}</label>
              ))}
            </fieldset>
            <fieldset><legend>Color</legend><div className="editor-colors">
              {itemColors.map((color, index) => <button key={color} type="button" style={{ background: color }}
                aria-label={['Blue', 'Green', 'Amber', 'Pink', 'Purple'][index]} aria-pressed={color === draft.color}
                onClick={() => change('color', color)} />)}
            </div></fieldset>
          </div>
          <label>Link<input type="url" aria-label="Link" value={draft.link} aria-invalid={Boolean(errors.link)}
            onChange={(event) => change('link', event.target.value)} />{feedback('link')}</label>
        </div>
        <footer>
          {editing ? <button type="button" className="editor-delete" onClick={props.onDelete}>Delete</button>
            : <label><input type="checkbox" checked={another} onChange={(event) => props.onAnother(event.target.checked)} /> Create another</label>}
          <button type="button" onClick={props.onCancel}>Cancel</button>
          <div className="editor-primary"><button type="submit">{editing ? 'Save' : 'Create'}</button><small>Ctrl / ⌘ + Enter</small></div>
        </footer>
      </form>
      <dialog ref={dialog} aria-labelledby="item-confirmation-title"
        onCancel={(event) => { event.preventDefault(); props.onKeepEditing(); }}
        onClose={props.onKeepEditing}>
        <p id="item-confirmation-title">{confirmation === 'delete' ? 'Delete this item?' : 'Discard changes?'}</p>
        <div className="editor-confirm-actions">
          <button type="button" autoFocus onClick={props.onKeepEditing}>Keep editing</button>
          <button type="button" onClick={props.onConfirm}>{confirmation === 'delete' ? 'Delete item' : 'Discard changes'}</button>
        </div>
      </dialog>
    </section>
  );
}
