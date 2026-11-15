const paths = {
  minimize: 'M4 11h12',
  restore: 'M7 6V3h10v10h-3M3 7h10v10H3z',
  close: 'm5 5 10 10M15 5 5 15',
  trash: 'M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6m4-6v6',
};

export function EditorIcon({ name }: { name: keyof typeof paths }) {
  return <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} />
  </svg>;
}
