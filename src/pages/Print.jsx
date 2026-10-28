import { useEffect, useState } from 'react';
import { NotePrint } from '../components/NoteEditor.jsx';
import { api, DB } from '../lib/api.js';

// Hidden window used for "Ekspor PDF": renders one note, then tells the main process it can print.
export default function Print() {
  const id = decodeURIComponent(location.hash.replace(/^#\/print\//, ''));
  const [note, setNote] = useState(null);
  useEffect(() => { document.body.classList.add('print-root'); DB.get('notes', id).then(setNote); }, [id]);
  if (!note) return null;
  return <NotePrint note={note} onReady={() => api('print:ready')} />;
}
