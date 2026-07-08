type Props = { before: string; after: string; mode?: 'inline' | 'sideBySide' };

export function DiffView({ before, after, mode = 'inline' }: Props) {
  if (mode === 'sideBySide') {
    return (
      <div className="diffview diffview--side">
        <div className="diffview__col">
          <pre>{before}</pre>
        </div>
        <div className="diffview__col">
          <pre>{after}</pre>
        </div>
      </div>
    );
  }
  return (
    <div className="diffview diffview--inline">
      <div className="diffview__before">
        <pre>{before}</pre>
      </div>
      <div className="diffview__after">
        <pre>{after}</pre>
      </div>
    </div>
  );
}
