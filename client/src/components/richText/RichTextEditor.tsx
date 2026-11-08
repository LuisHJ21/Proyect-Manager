import { hasHtmlTags, isBlankRichText, plainToHtml } from '@pm/shared';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading3, Italic, List, ListOrdered, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';

/** HTML para el editor: el texto plano antiguo se convierte en párrafos. */
export const toEditorHtml = (value: string) => (hasHtmlTags(value) ? value : plainToHtml(value));

type Props = {
  value: string;
  onChange: (html: string) => void;
  label: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  minHeight?: 'sm' | 'md';
};

const AREA_CLASS =
  'block w-full rounded-b-lg border border-control bg-surface px-3 py-2 text-sm text-ink focus:border-link focus:outline-2 focus:outline-link aria-[invalid=true]:border-risk-fg ' +
  '[&_h3]:mt-2 [&_h3]:text-base [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1';

function ToolbarButton({ label, Icon, onClick, pressed }: { label: string; Icon: LucideIcon; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-md hover:bg-raised hover:text-ink ${pressed ? 'bg-active text-link' : 'text-ink-soft'}`}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function Toolbar({ editor, label }: { editor: Editor; label: string }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      heading: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
    }),
  });
  const chain = () => editor.chain().focus();
  return (
    <div role="toolbar" aria-label={`Formato de ${label}`} className="flex flex-wrap gap-0.5 rounded-t-lg border border-b-0 border-control bg-raised/40 p-1">
      <ToolbarButton label="Negrita" Icon={Bold} pressed={state.bold} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton label="Cursiva" Icon={Italic} pressed={state.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolbarButton label="Título de sección" Icon={Heading3} pressed={state.heading} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
      <ToolbarButton label="Lista con viñetas" Icon={List} pressed={state.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton label="Lista numerada" Icon={ListOrdered} pressed={state.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <span className="mx-1 w-px self-stretch bg-line" aria-hidden="true" />
      <ToolbarButton label="Deshacer" Icon={Undo2} onClick={() => chain().undo().run()} />
      <ToolbarButton label="Rehacer" Icon={Redo2} onClick={() => chain().redo().run()} />
    </div>
  );
}

/** Editor con formato básico: negrita, cursiva, título, listas, deshacer y rehacer. */
export function RichTextEditor({ value, onChange, label, id, 'aria-invalid': invalid, 'aria-describedby': describedBy, minHeight = 'sm' }: Props) {
  const lastEmitted = useRef(value);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const attributes: Record<string, string> = {
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    'aria-invalid': String(Boolean(invalid)),
    class: `${AREA_CLASS} ${minHeight === 'md' ? 'min-h-36' : 'min-h-24'}`,
  };
  if (id) attributes.id = id;
  if (describedBy) attributes['aria-describedby'] = describedBy;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
        underline: false,
      }),
    ],
    content: toEditorHtml(value),
    editorProps: { attributes },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      const next = isBlankRichText(html) ? '' : html;
      lastEmitted.current = next;
      onChangeRef.current(next);
    },
  });

  // Los atributos ARIA cambian con los errores del formulario.
  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, invalid, describedBy, id, label, minHeight]);

  // Un valor externo nuevo (por ejemplo, otro registro) se carga; lo que el editor acaba de emitir no.
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    editor.commands.setContent(toEditorHtml(value), { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;
  return (
    <div>
      <Toolbar editor={editor} label={label} />
      <EditorContent editor={editor} />
    </div>
  );
}
