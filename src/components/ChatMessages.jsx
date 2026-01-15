import { useEffect, useRef, useState, useMemo } from 'react';
import Markdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { MESSAGE_ROLE, SCROLL_THRESHOLD } from '../constants';

function parseContentWithHtmlBlocks(content) {
  if (!content || typeof content !== 'string') return [{ type: 'markdown', content: '' }];

  const parts = [];
  const htmlBlockRegex = /```html\s*\n([\s\S]*?)```/gi;
  let lastIndex = 0;
  let match;

  while ((match = htmlBlockRegex.exec(content)) !== null) {
    // Add markdown content before this HTML block
    if (match.index > lastIndex) {
      const mdContent = content.slice(lastIndex, match.index).trim();
      if (mdContent) {
        parts.push({ type: 'markdown', content: mdContent });
      }
    }

    // Add the HTML block
    const htmlContent = match[1].trim();
    if (htmlContent) {
      parts.push({ type: 'html', content: htmlContent });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining markdown content after the last HTML block
  if (lastIndex < content.length) {
    const mdContent = content.slice(lastIndex).trim();
    if (mdContent) {
      parts.push({ type: 'markdown', content: mdContent });
    }
  }

  // If no HTML blocks found, return original content as markdown
  if (parts.length === 0) {
    return [{ type: 'markdown', content }];
  }

  return parts;
}

const HEIGHT_STEP = 100;
const MIN_HEIGHT = 100;
const MAX_HEIGHT = 2000;
const DEFAULT_HEIGHT = 200;

function SandboxedHtml({ html }) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [showRaw, setShowRaw] = useState(false);

  const srcDoc = useMemo(() => {
    const wrappedHtml = html.includes('<html') || html.includes('<!DOCTYPE')
      ? html
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;margin:8px;color:#333;}</style></head><body>${html}</body></html>`;
    return wrappedHtml;
  }, [html]);

  useEffect(() => {
    if (showRaw) return;

    const iframe = iframeRef.current;
    if (!iframe) return;

    const handleLoad = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc && doc.body) {
          const newHeight = Math.min(Math.max(doc.body.scrollHeight + 20, MIN_HEIGHT), MAX_HEIGHT);
          setHeight(newHeight);
        }
      } catch (e) {
        // Cross-origin restrictions may prevent access
      }
    };

    iframe.addEventListener('load', handleLoad);
    return () => iframe.removeEventListener('load', handleLoad);
  }, [srcDoc, showRaw]);

  const increaseHeight = () => {
    setHeight((h) => Math.min(h + HEIGHT_STEP, MAX_HEIGHT));
  };

  const decreaseHeight = () => {
    setHeight((h) => Math.max(h - HEIGHT_STEP, MIN_HEIGHT));
  };

  return (
    <div className="sandboxed-html-container">
      <div className="sandboxed-html-toolbar">
        <div className="sandboxed-html-toolbar-left">
          <button
            type="button"
            className={`sandboxed-html-btn ${!showRaw ? 'active' : ''}`}
            onClick={() => setShowRaw(false)}
          >
            Preview
          </button>
          <button
            type="button"
            className={`sandboxed-html-btn ${showRaw ? 'active' : ''}`}
            onClick={() => setShowRaw(true)}
          >
            Raw HTML
          </button>
        </div>
        <div className="sandboxed-html-toolbar-right">
          <button
            type="button"
            className="sandboxed-html-btn"
            onClick={decreaseHeight}
            disabled={height <= MIN_HEIGHT}
            title="Decrease height"
          >
            −
          </button>
          <button
            type="button"
            className="sandboxed-html-btn"
            onClick={increaseHeight}
            disabled={height >= MAX_HEIGHT}
            title="Increase height"
          >
            +
          </button>
        </div>
      </div>
      {showRaw ? (
        <SyntaxHighlighter
          language="html"
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            height: `${height}px`,
            fontSize: '12px',
            borderRadius: 0,
          }}
          wrapLongLines
        >
          {html}
        </SyntaxHighlighter>
      ) : (
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          className="sandboxed-html-iframe"
          style={{ height: `${height}px` }}
          title="HTML content"
        />
      )}
    </div>
  );
}

function ToolCallDisplay({ toolCall }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toolName = toolCall.name || toolCall.toolName || 'Unknown Tool';
  const toolInput = toolCall.input || toolCall.arguments || toolCall.parameters || {};
  const toolOutput = toolCall.output || toolCall.result || null;
  const toolStatus = toolCall.status || (toolOutput ? 'completed' : 'pending');

  const formatJson = (obj) => {
    try {
      if (typeof obj === 'string') {
        return obj;
      }
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  };

  return (
    <div className="tool-call">
      <div
        className="tool-call-header"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className={`tool-call-status tool-call-status-${toolStatus}`}>
          {toolStatus === 'completed' ? '\u2713' : toolStatus === 'error' ? '\u2717' : '\u2022'}
        </span>
        <span className="tool-call-name">{toolName}</span>
        <span className="tool-call-toggle">{isExpanded ? '\u25BC' : '\u25B6'}</span>
      </div>
      {isExpanded && (
        <div className="tool-call-details">
          <div className="tool-call-section">
            <div className="tool-call-section-title">Input</div>
            <pre className="tool-call-json">{formatJson(toolInput)}</pre>
          </div>
          {toolOutput && (
            <div className="tool-call-section">
              <div className="tool-call-section-title">Output</div>
              <pre className="tool-call-json">{formatJson(toolOutput)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CitationDisplay({ citation, messageId }) {
  const sources = citation.sources || [];

  if (sources.length === 0) {
    return null;
  }

  return (
    <>
      {sources.map((source, idx) => {
        const title = source.title || `Source ${source.number || idx + 1}`;
        const url = source.url || source.uri;
        let hostname = null;
        try {
          if (url) {
            hostname = new URL(url).hostname;
          }
        } catch (e) {
          // Invalid URL
        }

        return (
          <div
            key={source.number || idx}
            className="citation"
            data-source-number={source.number || idx + 1}
            data-message-id={messageId}
          >
            <div className="citation-index">{source.number || idx + 1}</div>
            <div className="citation-content">
              <div className="citation-title">{title}</div>
              {hostname && <div className="citation-source">{hostname}</div>}
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="citation-url"
                >
                  {url}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}

function ContentWithCitations({ content, citations, messageId }) {
  // Store citation data for tooltip rendering
  const citationDataMap = useRef({});

  const processedContent = useMemo(() => {
    if (!citations || citations.length === 0) {
      return content;
    }

    // Sort citations by offset in reverse order to process from end to start
    // This way we don't mess up offsets as we insert markers
    const sortedCitations = [...citations].sort((a, b) => b.offset - a.offset);

    let result = content;
    sortedCitations.forEach((citation, idx) => {
      const { offset, length, sources, citationId } = citation;
      const citedText = result.slice(offset, offset + length);

      // Store citation data for later tooltip rendering
      citationDataMap.current[citationId] = { sources, citationId };

      // Wrap cited text with a special marker that survives markdown
      const marker = `<cite data-citation-id="${citationId}">${citedText}</cite>`;
      result = result.slice(0, offset) + marker + result.slice(offset + length);
    });

    return result;
  }, [content, citations]);

  // Custom component to render cite elements
  const components = useMemo(() => ({
    cite: ({ node, children, ...props }) => {
      const citationId = props['data-citation-id'];
      const citationData = citationDataMap.current[citationId];
      const sources = citationData?.sources || [];
      const sourceInfo = sources.map(s => s.title).join(', ') || 'Source';
      const sourceNumbers = sources.map(s => s.number).filter(Boolean);

      const handleClick = () => {
        // Find and highlight the citation in the Sources section (scoped to same message)
        sourceNumbers.forEach(num => {
          const citationEl = document.querySelector(
            `[data-message-id="${messageId}"][data-source-number="${num}"]`
          );
          if (citationEl) {
            citationEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            citationEl.classList.add('citation-highlighted');
            setTimeout(() => {
              citationEl.classList.remove('citation-highlighted');
            }, 2000);
          }
        });
      };

      return (
        <mark className="cited-text" onClick={handleClick}>
          {children}
          <span className="citation-tooltip">
            <span className="citation-tooltip-title">{sourceInfo}</span>
            <span className="citation-tooltip-hint">Click to see source</span>
          </span>
        </mark>
      );
    },
  }), [messageId]);

  return (
    <>
      {parseContentWithHtmlBlocks(processedContent).map((part, partIndex) => (
        part.type === 'html' ? (
          <SandboxedHtml key={partIndex} html={part.content} />
        ) : (
          <Markdown
            key={partIndex}
            components={components}
            rehypePlugins={[rehypeRaw]}
          >
            {part.content}
          </Markdown>
        )
      ))}
    </>
  );
}

export default function ChatMessages({ messages, isLoading }) {
  const containerRef = useRef(null);
  const [isUserScrolled, setIsUserScrolled] = useState(false);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;

    const isAtBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <
      SCROLL_THRESHOLD;
    setIsUserScrolled(!isAtBottom);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || isUserScrolled) return;

    container.scrollTop = container.scrollHeight;
  }, [messages, isUserScrolled]);

  return (
    <div className="chat-messages" ref={containerRef} onScroll={handleScroll}>
      {isLoading && messages.length === 0 && (
        <div className="chat-loading">Loading messages...</div>
      )}
      {!isLoading && messages.length === 0 && (
        <div className="chat-empty">
          No messages yet. Start a conversation!
        </div>
      )}
      {messages.map((message, index) => (
        <div
          key={message.id || index}
          className={`chat-message ${
            message.role === MESSAGE_ROLE.USER
              ? 'chat-message-user'
              : 'chat-message-assistant'
          }`}
        >
          <div className="chat-message-role">
            {message.role === MESSAGE_ROLE.USER ? 'You' : 'Assistant'}
          </div>
          {message.content && (
            <div className="chat-message-content">
              <ContentWithCitations
                content={message.content}
                citations={message.citations}
                messageId={message.id}
              />
            </div>
          )}
          {message.citations && message.citations.length > 0 && (
            <div className="citations-container">
              <div className="citations-header">Sources</div>
              {message.citations.map((citation, cIndex) => (
                <CitationDisplay
                  key={citation.citationId || cIndex}
                  citation={citation}
                  messageId={message.id}
                />
              ))}
            </div>
          )}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="tool-calls-container">
              <div className="tool-calls-header">Tool Calls</div>
              {message.toolCalls.map((toolCall, tcIndex) => (
                <ToolCallDisplay
                  key={toolCall.id || toolCall.toolCallId || tcIndex}
                  toolCall={toolCall}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
