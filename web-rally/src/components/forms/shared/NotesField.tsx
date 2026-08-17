interface NotesFieldProps {
  idPrefix: string;
  notes: string;
  onChange: (value: string) => void;
}

export default function NotesField({ idPrefix, notes, onChange }: Readonly<NotesFieldProps>) {
  const inputId = `${idPrefix}-notes`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-medium text-foreground">
        Notas (opcional)
      </label>
      <textarea
        id={inputId}
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-muted p-3 text-foreground placeholder:text-muted-foreground focus:border-red-500 focus:ring-1 focus:ring-red-500"
        placeholder="Adiciona notas adicionais..."
        rows={3}
      />
    </div>
  );
}
