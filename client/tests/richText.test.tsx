import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextEditor } from '../src/components/richText/RichTextEditor';
import { RichTextClamp, RichTextView } from '../src/components/richText/RichTextView';
import { setRichText } from './helpers';

const FORMAT_BUTTONS = ['Negrita', 'Cursiva', 'Título de sección', 'Lista con viñetas', 'Lista numerada'];

function Harness({ initial = '', onChange = () => {} }: { initial?: string; onChange?: (html: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <RichTextEditor
      label="Campo"
      value={value}
      onChange={(html) => {
        setValue(html);
        onChange(html);
      }}
    />
  );
}

describe('RichTextEditor', () => {
  it('muestra los siete botones con aria-pressed', async () => {
    render(<Harness />);
    for (const name of FORMAT_BUTTONS) {
      expect(await screen.findByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByRole('button', { name: 'Deshacer' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('button', { name: 'Rehacer' })).not.toHaveAttribute('aria-pressed');
    expect(screen.getByRole('toolbar', { name: 'Formato de Campo' })).toBeInTheDocument();
  });

  it('Negrita activa el formato', async () => {
    render(<Harness />);
    const textbox = await screen.findByRole('textbox', { name: 'Campo' });
    textbox.focus();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Negrita' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Negrita' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('Ctrl+B activa la negrita', async () => {
    render(<Harness />);
    const textbox = await screen.findByRole('textbox', { name: 'Campo' });
    textbox.focus();
    fireEvent.keyDown(textbox, { key: 'b', ctrlKey: true });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Negrita' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('abre el texto antiguo en párrafos sin emitir cambios', async () => {
    const onChange = vi.fn();
    render(<Harness initial={'Uno\nDos'} onChange={onChange} />);
    const textbox = await screen.findByRole('textbox', { name: 'Campo' });
    const paragraphs = textbox.querySelectorAll('p');
    expect([...paragraphs].map((p) => p.textContent)).toEqual(['Uno', 'Dos']);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("emite HTML y un campo vacío como ''", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await screen.findByRole('textbox', { name: 'Campo' });
    await setRichText('Campo', '<p><strong>Hola</strong></p>');
    expect(onChange).toHaveBeenLastCalledWith('<p><strong>Hola</strong></p>');
    await setRichText('Campo', '<p></p>');
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});

describe('RichTextView', () => {
  it('limpia lo peligroso', () => {
    const { container } = render(<RichTextView html={'<p onclick="x">a</p><script>alert(1)</script><img src=x>'} />);
    const paragraph = container.querySelector('p');
    expect(paragraph).toHaveTextContent('a');
    expect(paragraph).not.toHaveAttribute('onclick');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('muestra el texto antiguo literal', () => {
    const { container } = render(<RichTextView html={'a < b\nc'} />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('a < b');
  });

  it('muestra el texto vacío', () => {
    render(<RichTextView html="<p><br></p>" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('RichTextClamp muestra el texto plano', () => {
    render(<RichTextClamp html="<p><strong>Uno</strong></p><p>Dos</p>" />);
    const text = screen.getByText('Uno Dos');
    expect(text).toHaveClass('line-clamp-2');
    expect(text.querySelector('strong')).toBeNull();
  });
});
