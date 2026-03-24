import React from 'react';
import remarkGfm from 'remark-gfm';
import { MemoizedReactMarkdown } from './MemoizedReactMarkdown';
import rehypeRaw from 'rehype-raw';
import { useConfig } from '@opencx/widget-react-headless';
import { Dialoger, DialogerContent } from './Dialoger';
import { ZoomableImage } from './ZoomableImage';

export function RichText({
  children,
  messageType,
  messageId,
}: {
  children: string;
  messageType?: string;
  messageId?: string;
}) {
  const { anchorTarget } = useConfig();

  return (
    <MemoizedReactMarkdown
      data-type={messageType}
      data-id={messageId}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ children, ...props }) => {
          return (
            <a target={props.target || anchorTarget || '_top'} {...props}>
              {children}
            </a>
          );
        },
        img: ({ src, alt, ...props }) => {
          if (!src) return <img src={src} alt={alt} {...props} />;
          return (
            <Dialoger
              trigger={
                <img
                  src={src}
                  alt={alt}
                  {...props}
                  className="cursor-pointer rounded-xl"
                />
              }
            >
              <DialogerContent
                className="size-full max-w-full rounded-3xl flex items-center justify-center bg-transparent border-none gap-0"
                withClose
              >
                <ZoomableImage src={src} alt={alt} />
              </DialogerContent>
            </Dialoger>
          );
        },
      }}
      // Do not pass className directly to ReactMarkdown component because that will create a container div wrapping the rich text
    >
      {children}
    </MemoizedReactMarkdown>
  );
}
