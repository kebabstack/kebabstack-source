// A deliberately small text renderer. No HTML from tickets is ever trusted.
export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decodeSlack = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const safeUrl = value => {
  try { const u = new URL(value); return ['https:', 'http:', 'mailto:'].includes(u.protocol) ? u.href : null; } catch { return null; }
};
export function plainMessage(value) {
  return decodeSlack(String(value ?? '')).replace(/<((?:https?:\/\/|mailto:)[^>|]+)(?:\|([^>]*))?>/g, (_, url, label) => label || url.replace(/^mailto:/, ''));
}
export function readableSubject(subject, body = '') {
  const title = plainMessage(subject).trim();
  if (!/^(hi|hello|hey|good morning|good afternoon)(\s+(it|team|all|everyone|there))?[,!.\s]*$/i.test(title)) return title;
  return plainMessage(body).split('\n').map(s => s.trim()).find(s => s && !/^(hi|hello|hey|good morning|good afternoon)(\s+(it|team|all|everyone|there))?[,!.\s]*$/i.test(s)) || title;
}
function inline(source) {
  const text = decodeSlack(source);
  const pattern = /`([^`\n]+)`|<((?:https?:\/\/|mailto:)[^>\s|]+)(?:\|([^>]*))?>|<@([UW][A-Z0-9]+)(?:\|([^>]+))?>|<#([A-Z0-9]+)(?:\|([^>]+))?>|<!(here|channel|everyone)>|\[([^\]\n]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s<>]+)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~/g;
  let html = '', pos = 0;
  for (const m of text.matchAll(pattern)) {
    html += escapeHtml(text.slice(pos, m.index)); pos = m.index + m[0].length;
    if (m[1]) { html += `<code>${escapeHtml(plainMessage(m[1]))}</code>`; continue; }
    const rawUrl = m[2] || m[10] || m[11];
    if (rawUrl) {
      const tail = m[11] ? (rawUrl.match(/[.,;!?]+$/)?.[0] || '') : '';
      const url = safeUrl(tail ? rawUrl.slice(0, -tail.length) : rawUrl);
      const label = m[3] || m[9] || (tail ? rawUrl.slice(0, -tail.length) : rawUrl).replace(/^mailto:/, '');
      html += url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>${escapeHtml(tail)}` : escapeHtml(m[0]);
    } else if (m[4]) {
      html += `<span class="mention" title="Slack member ${escapeHtml(m[4])}">@${escapeHtml(m[5] || m[4])}</span>`;
    } else if (m[6]) html += `<span class="mention">#${escapeHtml(m[7] || 'Slack channel')}</span>`;
    else if (m[8]) html += `<span class="mention">@${m[8]}</span>`;
    else if (m[12] || m[13]) html += `<strong>${escapeHtml(m[12] || m[13])}</strong>`;
    else if (m[14]) html += `<em>${escapeHtml(m[14])}</em>`;
    else if (m[15]) html += `<s>${escapeHtml(m[15])}</s>`;
  }
  return html + escapeHtml(text.slice(pos));
}
export function formatMessage(value) {
  const lines = String(value ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; let paragraph = [], list = [], listKind = '', listStart = 1, code = [], fenced = false;
  const flushParagraph = () => { if (paragraph.length) out.push(`<p>${inline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`); paragraph = []; };
  const flushList = () => { if (list.length) out.push(`<${listKind}${listKind === 'ol' ? ` start="${listStart}"` : ''}>${list.map(s => `<li>${inline(s)}</li>`).join('')}</${listKind}>`); list = []; listKind = ''; };
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList();
      if (fenced) { out.push(`<pre><code>${escapeHtml(plainMessage(code.join('\n')))}</code></pre>`); code = []; }
      fenced = !fenced; continue;
    }
    if (fenced) { code.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const bullet = line.match(/^\s*(?:([-*•])\s+|(\d+)[.)]\s+)(.*)$/);
    if (bullet) {
      flushParagraph(); const kind = bullet[2] ? 'ol' : 'ul';
      if (listKind && kind !== listKind) flushList();
      if (!list.length && bullet[2]) listStart = Number(bullet[2]);
      listKind = kind; list.push(bullet[3]); continue;
    }
    if (list.length) { list[list.length - 1] += ' ' + line.trim(); continue; }
    if (/^>\s?/.test(line)) { flushParagraph(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`); continue; }
    paragraph.push(line.trim());
  }
  if (code.length) out.push(`<pre><code>${escapeHtml(plainMessage(code.join('\n')))}</code></pre>`);
  flushParagraph(); flushList(); return out.join('');
}
