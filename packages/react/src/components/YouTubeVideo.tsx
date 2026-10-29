import { Play } from 'lucide-react';
import React from 'react';
import { Dialoger, DialogerContent } from './Dialoger';

export function YouTubeVideo({ id, title }: { id: string; title: string }) {
  return (
    <Dialoger
      trigger={
        <button
          type="button"
          className="not-prose relative block w-full max-w-64 overflow-hidden rounded-xl border"
        >
          <img
            src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
            alt={title}
            className="aspect-video w-full object-cover"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-black/60 text-white">
              <Play className="size-5 fill-current" />
            </span>
          </span>
        </button>
      }
    >
      <DialogerContent
        className="size-full max-w-full rounded-3xl flex items-center justify-center bg-transparent border-none gap-0"
        withClose
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="aspect-video w-full rounded-2xl"
        />
      </DialogerContent>
    </Dialoger>
  );
}
