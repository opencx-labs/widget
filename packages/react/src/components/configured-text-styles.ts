import { defaultSchema } from 'rehype-sanitize';

// This schema is only used for host-configured content. Message HTML continues
// to use the stricter RichText schema, which drops style attributes entirely.
export const configuredTextSchema: typeof defaultSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'style'],
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
  },
};

const allowedProperty =
  /^(color|background-color|font-(family|size|style|weight)|text-(align|decoration|transform)|line-height|letter-spacing|white-space|display|width|height|max-width|min-width|margin(-top|-right|-bottom|-left)?|padding(-top|-right|-bottom|-left)?|border(-width|-style|-color|-radius)?)$/i;
const allowedValue = /^[\w\s#.,%()'"+-]+$/;
const unsafeFunction = /\b(url|expression|var|attr)\s*\(/i;

type HtmlNode = {
  type: string;
  properties?: Record<string, unknown>;
  children?: HtmlNode[];
};

/** Allow presentation styles without URL loads, CSS escapes or positioning. */
export function filterConfiguredStyles() {
  return function visit(node: HtmlNode): void {
    const style = node.properties?.style;
    if (typeof style === 'string' && node.properties) {
      node.properties.style = style
        .split(';')
        .filter((declaration) => {
          const colon = declaration.indexOf(':');
          if (colon < 0) return false;
          const property = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          return (
            allowedProperty.test(property) &&
            allowedValue.test(value) &&
            !unsafeFunction.test(value)
          );
        })
        .join(';');
    }
    node.children?.forEach(visit);
  };
}
