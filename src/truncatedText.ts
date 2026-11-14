export function showTruncatedText({ target }: { target: EventTarget | null }) {
  if (!(target instanceof Element)) return;
  const text = target.closest<HTMLElement>('[data-truncated-text]');
  if (!text) return;
  if (text.scrollWidth > text.clientWidth || text.scrollHeight - text.clientHeight > 1) {
    text.title = text.textContent ?? '';
  } else {
    text.removeAttribute('title');
  }
}
