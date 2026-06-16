import * as React from 'react';
import { Button } from '@/components/ui/button.jsx';
import { cn } from '@/lib/utils.js';
import { useUI } from '@/i18n';

const EMOJIS = [
  { score: 1, emoji: '😞', labelKey: 'supportRating1' },
  { score: 2, emoji: '😐', labelKey: 'supportRating2' },
  { score: 3, emoji: '🙂', labelKey: 'supportRating3' },
  { score: 4, emoji: '😄', labelKey: 'supportRating4' },
  { score: 5, emoji: '🤩', labelKey: 'supportRating5' },
];

export function SatisfactionRating({ onSubmit, submitted }) {
  const ui = useUI();
  const [selected, setSelected] = React.useState(null);
  const [comment, setComment] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await onSubmit(selected, comment.trim());
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 px-4 text-center text-sm text-muted-foreground border-t border-border/50">
        <span>{ui('supportRatingThanks')}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 py-4 px-4 border-t border-border/50 bg-muted/20">
      <p className="text-sm font-medium text-center">{ui('supportRateExperience')}</p>
      <div className="flex justify-center gap-3">
        {EMOJIS.map(({ score, emoji }) => (
          <button
            key={score}
            type="button"
            onClick={() => setSelected(score)}
            aria-label={ui(`supportRating${score}`)}
            className={cn(
              'text-2xl transition-transform hover:scale-125 focus:outline-none',
              selected === score ? 'scale-125 drop-shadow-md' : 'opacity-70'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={280}
        rows={2}
        placeholder={ui('supportAddComment')}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <Button
        size="sm"
        disabled={!selected || submitting}
        onClick={handleSubmit}
        className="w-full"
      >
        {ui('supportSubmitRating')}
      </Button>
    </div>
  );
}
