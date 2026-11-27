// Turn uploads and URLs into plain text for chunking.
import 'server-only';
import { extractText, getDocumentProxy } from 'unpdf';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_TEXT_CHARS = 400_000; // ~100k tokens per document

export class ParseError extends Error {}

export async function parseFile(name: string, type: string, bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ParseError(`${name} is larger than 15 MB`);
  const lower = name.toLowerCase();
  let text: string;
  if (type === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdf = await getDocumentProxy(bytes);
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (/^text\//.test(type) || /\.(md|markdown|txt)$/.test(lower)) {
    text = new TextDecoder().decode(bytes);
  } else {
    throw new ParseError(`${name}: only PDF, Markdown and plain-text files are supported`);
  }
  if (!text.trim()) throw new ParseError(`${name} has no extractable text (is it a scanned PDF?)`);
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Fetch a public web page and reduce it to readable text with headings kept as markdown. */
export async function parseUrl(url: string): Promise<{ title: string; text: string }> {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new ParseError('Only http(s) URLs are supported');
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith('.local')) {
    throw new ParseError('Private network addresses are not allowed');
  }
  const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(15_000), headers: { 'user-agent': 'AdaptiveLearningPlatform/2.0 (+course builder)' } });
  if (!res.ok) throw new ParseError(`Could not fetch ${url} (HTTP ${res.status})`);
  const type = res.headers.get('content-type') ?? '';
  const buf = new Uint8Array(await res.arrayBuffer());
  if (type.includes('pdf')) return { title: u.pathname.split('/').pop() || u.hostname, text: await parseFile('page.pdf', 'application/pdf', buf) };
  const html = new TextDecoder().decode(buf.slice(0, MAX_UPLOAD_BYTES));
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || u.hostname;
  const text = html
    .replace(/<(script|style|nav|footer|header|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l: string, t: string) => `\n\n${'#'.repeat(Number(l))} ${t.replace(/<[^>]+>/g, '')}\n\n`)
    .replace(/<(p|li|br|div|section|article|pre|tr)[^>]*>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"');
  if (!text.trim()) throw new ParseError(`${url} has no readable text`);
  return { title: decodeEntities(title), text: text.slice(0, MAX_TEXT_CHARS) };
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
