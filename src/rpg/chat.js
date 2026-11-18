/**
 * Chat de Roleplay com formatação automática segura (sem innerHTML).
 * Suporta comandos: /me <ação>, /ooc <texto>, /ic <fala>, /w <mensagem para GM>.
 */

export function parseChatCommand(rawText, defaultSpeaker = 'Jogador') {
  const text = String(rawText || '').trim();
  if (!text) return null;

  if (text.startsWith('/me ')) {
    return { mode: 'action', speaker: defaultSpeaker, body: text.slice(4).trim() };
  }
  if (text.startsWith('/ooc ')) {
    return { mode: 'ooc', speaker: defaultSpeaker, body: text.slice(5).trim() };
  }
  if (text.startsWith('/ic ')) {
    return { mode: 'ic', speaker: defaultSpeaker, body: text.slice(4).trim() };
  }
  if (text.startsWith('/w ')) {
    return { mode: 'whisper', speaker: defaultSpeaker, body: text.slice(3).trim() };
  }
  return { mode: 'ic', speaker: defaultSpeaker, body: text };
}

/**
 * Renderiza **negrito** e *itálico* em nós DOM seguros (sem XSS).
 */
export function renderFormattedText(container, text) {
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      container.appendChild(document.createTextNode(text.slice(lastIndex, m.index)));
    }
    const token = m[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      container.appendChild(strong);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      const em = document.createElement('em');
      em.textContent = token.slice(1, -1);
      container.appendChild(em);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    container.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
