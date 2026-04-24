'use client';

import { useEffect, useMemo, useRef } from 'react';
import sanitizeHtml from 'sanitize-html';

interface Props {
  html: string | null;
  text: string | null;
  snippet: string | null;
}

function isBadImageSrc(src: string, width?: string, height?: string): boolean {
  const trimmed = (src || '').trim();
  if (!trimmed) return true;
  const w = parseInt(width || '0', 10);
  const h = parseInt(height || '0', 10);
  const isTracker = w > 0 && h > 0 && w <= 2 && h <= 2;
  const isCid = /^cid:/i.test(trimmed);
  const isBadScheme = !/^(https?:|data:)/i.test(trimmed);
  return isTracker || isCid || isBadScheme;
}

const SANITIZE_OPTS: sanitizeHtml.IOptions = {
  allowedTags: [
    'a', 'b', 'i', 'u', 's', 'em', 'strong', 'small', 'sub', 'sup', 'code', 'pre',
    'p', 'br', 'hr', 'div', 'span', 'blockquote',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'img', 'figure', 'figcaption',
  ],
  allowedAttributes: {
    a: ['href', 'name', 'target', 'rel', 'title'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'referrerpolicy'],
    table: ['border', 'cellpadding', 'cellspacing'],
    '*': ['style', 'align', 'colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowedStyles: {
    '*': {
      color: [/^.*$/],
      'background-color': [/^.*$/],
      'text-align': [/^left$|^right$|^center$|^justify$/],
      'font-weight': [/^.*$/],
      'font-style': [/^.*$/],
      'font-size': [/^[\d.]+(px|em|rem|%)$/],
      'text-decoration': [/^.*$/],
      margin: [/^[\d.\s]+(px|em|rem|%)$/],
      padding: [/^[\d.\s]+(px|em|rem|%)$/],
    },
  },
  transformTags: {
    // Open external links in a new tab with safe rel.
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    }),
    // For images we keep, add privacy + perf attributes. Bad images are
    // dropped entirely by exclusiveFilter below so their parent wrappers
    // become :empty and get hidden by CSS.
    img: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      },
    }),
  },
  // Drop whole subtrees we don't want rendered at all. Returning true
  // removes the element AND any contents. Using this for images means the
  // parent <td>/<div> ends up with no children and CSS's :empty hides it.
  exclusiveFilter: (frame) => {
    if (frame.tag === 'img') {
      return isBadImageSrc(frame.attribs.src || '', frame.attribs.width, frame.attribs.height);
    }
    return false;
  },
};

/**
 * Renders an email body the way Gmail / Outlook do: sanitized HTML with
 * email-friendly typography. Falls back to the plain-text body when no
 * HTML part is present, preserving paragraph breaks.
 */
export default function EmailBody({ html, text, snippet }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sanitized = useMemo(() => (html ? sanitizeHtml(html, SANITIZE_OPTS) : null), [html]);

  // After the DOM renders, walk it and collapse wrappers that are now
  // effectively empty — marketing emails nest stripped images 3-5 tables
  // deep, so :empty alone can't catch them (a td containing an empty tr
  // isn't :empty). We iterate bottom-up until the tree stops shrinking.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const WRAPPER_TAGS = new Set(['TD', 'TH', 'TR', 'TABLE', 'TBODY', 'THEAD', 'TFOOT', 'DIV', 'SPAN', 'P']);
    let pruned = true;
    let safety = 0;
    while (pruned && safety < 10) {
      pruned = false;
      safety += 1;
      // Collect candidates first so we can mutate without invalidating NodeLists.
      const candidates: Element[] = [];
      root.querySelectorAll(Array.from(WRAPPER_TAGS).map((t) => t.toLowerCase()).join(',')).forEach((el) => candidates.push(el));
      for (const el of candidates) {
        if (!el.isConnected) continue;
        // Element is "effectively empty" if it has no text content and
        // no non-wrapper children (images, links, buttons, etc. count).
        const text = (el.textContent || '').trim();
        const hasContentChild = Array.from(el.children).some((c) => !WRAPPER_TAGS.has(c.tagName));
        if (!text && !hasContentChild) {
          el.remove();
          pruned = true;
        }
      }
    }

    // Hide any image that still fails to load at runtime (DNS fail, 403,
    // content blocker) so it doesn't render as a broken-image chrome box.
    const onErr = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && target.tagName === 'IMG') {
        (target as HTMLImageElement).style.display = 'none';
      }
    };
    root.addEventListener('error', onErr, true);
    return () => root.removeEventListener('error', onErr, true);
  }, [sanitized]);

  if (sanitized && sanitized.trim()) {
    return (
      <div
        ref={containerRef}
        className="email-body text-[14px] text-foreground leading-[1.65]"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  const raw = (text || snippet || '').trim();
  if (!raw) {
    return <p className="text-sm text-muted-foreground italic">(No content)</p>;
  }
  const paragraphs = raw.split(/\n{2,}/);
  return (
    <div className="email-body text-[14px] text-foreground leading-[1.7]">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-wrap mb-3 last:mb-0">
          {p}
        </p>
      ))}
    </div>
  );
}
