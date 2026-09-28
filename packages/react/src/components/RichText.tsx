import React from 'react';
import remarkGfm from 'remark-gfm';
import { MemoizedReactMarkdown } from './MemoizedReactMarkdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { useConfig } from '@opencx/widget-react-headless';
import { Dialoger, DialogerContent } from './Dialoger';
import { ZoomableImage } from './ZoomableImage';
import {
  configuredTextSchema,
  filterConfiguredStyles,
} from './configured-text-styles';
import { stripCitationRefs } from '../utils/strip-citation-refs';

/**
 * Everything rendered here is UNTRUSTED: AI replies, agent messages and
 * knowledge-base content all reach `RichText`, and the widget's React runs in
 * the embedder's realm — so raw HTML here executes on the customer's own site.
 *
 * `rehypeRaw` exists so authored HTML in a reply still renders, which means a
 * sanitizer is not optional. It MUST run after `rehypeRaw`: raw parses the HTML
 * string into real nodes, and only then is there a tree to strip. Reversing the
 * order silently sanitizes nothing.
 *
 * The base is `rehype-sanitize`'s GitHub schema (safe markdown-shaped HTML,
 * no `script`, no `on*` handlers, no `javascript:` URLs). The one addition is
 * `className` on `code`/`pre`, which `remark-gfm` emits for fenced code blocks
 * and the default schema would otherwise drop, breaking code formatting.
 */
const richTextSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
  },
};

type RichTextProps = {
  children: string;
  messageType?: string;
  messageId?: string;
};

export function RichText(props: RichTextProps) {
  return <RichTextContent {...props} />;
}

/** Host-authored footer HTML can keep safe typography and spacing. */
export function ConfiguredRichText(props: RichTextProps) {
  return <RichTextContent {...props} configuredStyles />;
}

function RichTextContent({
  children,
  messageType,
  messageId,
  configuredStyles = false,
}: RichTextProps & { configuredStyles?: boolean }) {
  const { anchorTarget } = useConfig();

  return (
    <MemoizedReactMarkdown
      data-type={messageType}
      data-id={messageId}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={
        configuredStyles
          ? [
              rehypeRaw,
              filterConfiguredStyles,
              [rehypeSanitize, configuredTextSchema],
            ]
          : [rehypeRaw, [rehypeSanitize, richTextSanitizeSchema]]
      }
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
      {stripCitationRefs(children)}
    </MemoizedReactMarkdown>
  );
}
