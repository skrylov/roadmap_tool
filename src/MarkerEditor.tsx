import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dateInput } from './calendar';

const nameLimit = 60;
export const markerColors = [
  { name: 'Blue', value: '#235da9' },
  { name: 'Teal', value: '#08756c' },
  { name: 'Ochre', value: '#865100' },
  { name: 'Rose', value: '#a63154' },
  { name: 'Violet', value: '#7043a5' },
];

export type Marker = { id: string; name: string; date: Date; color: string };
export type MarkerDraft = Omit<Marker, 'id' | 'date'> & { date: string };

export function MarkerEditor({ marker, active, anchor, onClose, onSave, onDelete, registerReplacement }: {
  marker?: Marker;
  active: boolean;
  anchor: HTMLElement;
  onClose: () => void;
  onSave: (draft: MarkerDraft) => void;
  onDelete: () => void;
  registerReplacement: (request: (replace: () => void) => void) => void;
}) {
  const [original] = useState<MarkerDraft>(() => ({
    name: marker?.name ?? '', date: dateInput(marker?.date), color: marker?.color ?? markerColors[0].value,
  }));
  const [draft, setDraft] = useState(original);
  const [submitted, setSubmitted] = useState(false);
  const [dateError, setDateError] = useState(false);
  const nameError = draft.name.length > nameLimit ? 'Use 60 characters or fewer.'
    : submitted && !draft.name.trim() ? 'Enter a name.' : '';
  const [confirmation, setConfirmation] = useState<{ message: string; label: string; apply: () => void }>();
  const panel = useRef<HTMLDivElement>(null);
  const name = useRef<HTMLInputElement>(null);
  const closing = useRef(false);
  const keep = useRef<HTMLButtonElement>(null);

  function requestDiscard(apply: () => void) {
    if (closing.current) return;
    if (Object.keys(draft).some((key) => draft[key as keyof MarkerDraft] !== original[key as keyof MarkerDraft])) {
      setConfirmation({ message: 'Discard unsaved marker changes?', label: 'Discard changes', apply });
    } else {
      apply();
    }
  }

  useLayoutEffect(() => registerReplacement(requestDiscard));

  useLayoutEffect(() => {
    const element = panel.current;
    if (!active || !element) return;
    function place() {
      const rect = anchor.getBoundingClientRect();
      const width = element!.offsetWidth;
      const height = element!.offsetHeight;
      const origin = rect.bottom + height + 14 <= window.innerHeight ? rect.bottom + 6 : rect.top - height - 6;
      element!.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) + 'px';
      element!.style.top = Math.max(8, Math.min(origin, window.innerHeight - height - 8)) + 'px';
    }
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [active, anchor]);

  useLayoutEffect(() => {
    if (active) (confirmation ? keep.current : name.current)?.focus({ preventScroll: true });
  }, [active, confirmation]);

  if (!active) return null;

  function close(apply: () => void) {
    if (closing.current) return;
    closing.current = true;
    const animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? undefined : panel.current?.animate([{ opacity: 1, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(.96)' }],
        { duration: 160, easing: 'ease-in', fill: 'forwards' });
    if (animation) {
      panel.current!.inert = true;
      void animation.finished.then(apply, apply);
    } else {
      apply();
    }
  }

  return createPortal(
    <div ref={panel} className="marker-editor" role="dialog" aria-labelledby="marker-editor-title"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        if (confirmation) setConfirmation(undefined);
        else requestDiscard(() => close(onClose));
      }}>
      <header>
        <strong id="marker-editor-title">{marker ? 'Edit marker' : 'Add marker'}</strong>
        <button type="button" aria-label="Close marker editor" onClick={() => requestDiscard(() => close(onClose))}>×</button>
      </header>
      {confirmation ? (
        <div role="group" aria-label={confirmation.message}>
          <p>{confirmation.message}</p>
          <footer>
            <button ref={keep} type="button" onClick={() => setConfirmation(undefined)}>Keep editing</button>
            <button type="button" onClick={() => close(confirmation.apply)}>{confirmation.label}</button>
          </footer>
        </div>
      ) : (
        <form noValidate onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!draft.name.trim() || draft.name.length > nameLimit) {
            name.current?.focus();
            return;
          }
          if ((marker || draft.date) && !Number.isFinite(+new Date(`${draft.date}T00:00:00`))) {
            setDateError(true);
            return;
          }
          close(() => onSave(draft));
        }}>
          <div className="marker-name-field">
            <label htmlFor="marker-name">Name</label>
            <input id="marker-name" ref={name} value={draft.name} required aria-invalid={Boolean(nameError)}
              aria-describedby={draft.name.length >= nameLimit * .8 || nameError ? 'marker-name-feedback' : undefined}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            {(draft.name.length >= nameLimit * .8 || nameError) && (
              <div id="marker-name-feedback">
                {draft.name.length >= nameLimit * .8 && <small>{draft.name.length} / {nameLimit}</small>}
                {nameError && <small role="alert">{nameError}</small>}
              </div>
            )}
          </div>
          <label>{marker ? 'Date' : 'Date (optional)'}
            <input type="date" value={draft.date} required={Boolean(marker)}
              aria-invalid={dateError}
              onChange={(event) => { setDateError(false); setDraft({ ...draft, date: event.target.value }); }} />
          </label>
          <fieldset>
            <legend>Color</legend>
            {markerColors.map(({ name, value }) => (
              <label key={value} className="marker-swatch" style={{ backgroundColor: value }} title={name}>
                <input type="radio" name="marker-color" aria-label={name} checked={draft.color === value}
                  onChange={() => setDraft({ ...draft, color: value })} />
              </label>
            ))}
          </fieldset>
          {dateError && <p role="alert">Enter a valid date.</p>}
          <footer>
            {marker && <button type="button" onClick={() => setConfirmation({
              message: 'Delete this marker?', label: 'Delete marker', apply: onDelete,
            })}>Delete</button>}
            <button type="button" onClick={() => requestDiscard(() => close(onClose))}>Cancel</button>
            <button type="submit">{marker ? 'Save' : 'Add'}</button>
          </footer>
        </form>
      )}
    </div>, document.body,
  );
}
