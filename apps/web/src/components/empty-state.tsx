export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line p-8 text-center">
      <p className="font-medium">{title}</p>
      {detail !== undefined ? <p className="mt-1 text-sm text-muted">{detail}</p> : null}
    </div>
  );
}
