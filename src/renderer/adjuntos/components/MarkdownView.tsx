// Presentational (markdown-attachment-viewer design — Vista mode
// typography): maps the domain's TYPED blocks/spans to JSX. No data
// fetching, no IPC, and no dangerouslySetInnerHTML anywhere — the parser
// never produces html strings, so there is nothing to inject.
import type { InlineSpan, MarkdownBlock } from '../domain/markdown'

// Fragment keys are positional — blocks re-render as one unit whenever the
// content string changes, there is no per-block identity to preserve.
function InlineSpans({ spans }: { spans: InlineSpan[] }): React.JSX.Element {
  return (
    <>
      {spans.map((span, index) => {
        switch (span.type) {
          case 'bold':
            return (
              <strong key={index} className="font-semibold text-foreground">
                {span.text}
              </strong>
            )
          case 'italic':
            return (
              <em key={index} className="italic">
                {span.text}
              </em>
            )
          case 'code':
            return (
              <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-body-sm text-foreground">
                {span.text}
              </code>
            )
          case 'strikethrough':
            return <s key={index}>{span.text}</s>
          default:
            return <span key={index}>{span.text}</span>
        }
      })}
    </>
  )
}

// The design pins H1 24/600 and H2 17/600 (both Space Grotesk); H3 exists in
// the parser's covered set, so it takes the next natural step down.
const HEADING_CLASSES: Record<1 | 2 | 3, string> = {
  1: 'font-display text-[24px] font-semibold text-foreground',
  2: 'font-display text-[17px] font-semibold text-foreground',
  3: 'font-display text-[15px] font-semibold text-foreground'
}

function Heading({ level, spans }: { level: 1 | 2 | 3; spans: InlineSpan[] }): React.JSX.Element {
  const Tag = `h${level}` as const
  return (
    <Tag className={HEADING_CLASSES[level]}>
      <InlineSpans spans={spans} />
    </Tag>
  )
}

interface MarkdownViewProps {
  blocks: MarkdownBlock[]
}

export function MarkdownView({ blocks }: MarkdownViewProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'heading':
            return <Heading key={index} level={block.level} spans={block.spans} />
          case 'paragraph':
            return (
              <p key={index} className="text-body leading-[1.6] text-secondary-foreground">
                <InlineSpans spans={block.spans} />
              </p>
            )
          case 'list':
            return (
              <ul key={index} className="flex flex-col gap-1.5">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="flex gap-2 text-body leading-[1.6] text-secondary-foreground">
                    {/* Accent bullet (design: brand-accent "•"; bold leads inside
                        the item get 13/600 primary via InlineSpans' bold). */}
                    <span className="select-none text-primary-ink" aria-hidden="true">
                      •
                    </span>
                    <span>
                      <InlineSpans spans={item} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          case 'blockquote':
            return (
              <blockquote key={index} className="flex gap-3">
                {/* 3px accent rounded bar (design). */}
                <span className="w-[3px] shrink-0 self-stretch rounded-full bg-primary" aria-hidden="true" />
                <p className="text-body italic leading-[1.6] text-secondary-foreground">
                  <InlineSpans spans={block.spans} />
                </p>
              </blockquote>
            )
          case 'code-block':
            return (
              <div key={index} className="flex flex-col gap-2 rounded-lg bg-muted p-3.5">
                {block.language !== null && (
                  <span className="text-micro font-semibold tracking-[0.5px] text-muted-foreground">
                    {block.language}
                  </span>
                )}
                <pre className="overflow-x-auto">
                  <code className="font-mono text-body-sm leading-[1.7] text-foreground">{block.content}</code>
                </pre>
              </div>
            )
        }
      })}
    </div>
  )
}
