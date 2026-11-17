/**
 * Parser e rolador de dados RPG seguro (sem eval, compatível com CSP estrita).
 * Suporta expressões como: 1d20+5, 2d6+1d4-2, 2d20kh1 (vantagem), 2d20kl1 (desvantagem).
 */

const TERM_RE = /([+-]?)\s*(?:(\d*)d(\d+)(?:(kh|kl)(\d+))?|(\d+))/gi;

export function parseAndRoll(expr, rng = Math.random) {
  const cleaned = String(expr || '').trim().replace(/\s+/g, '');
  if (!cleaned) throw new Error('Expressão vazia');

  let matchedLen = 0;
  const terms = [];
  let total = 0;

  TERM_RE.lastIndex = 0;
  let m;
  while ((m = TERM_RE.exec(cleaned)) !== null) {
    if (m.index !== matchedLen) {
      throw new Error(`Sintaxe inválida próximo a "${cleaned.slice(matchedLen)}"`);
    }
    matchedLen = TERM_RE.lastIndex;

    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      const count = m[2] ? parseInt(m[2], 10) : 1;
      const sides = parseInt(m[3], 10);
      const keepMode = m[4] ? m[4].toLowerCase() : null;
      const keepCount = m[5] ? parseInt(m[5], 10) : null;

      if (count < 1 || count > 100) throw new Error('Quantidade de dados deve ser entre 1 e 100');
      if (sides < 2 || sides > 1000) throw new Error('Lados do dado devem ser entre 2 e 1000');

      const rolls = [];
      for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(rng() * sides) + 1);
      }

      let kept = [...rolls];
      if (keepMode && keepCount != null) {
        const k = Math.max(1, Math.min(count, keepCount));
        const sorted = [...rolls].sort((a, b) => (keepMode === 'kh' ? b - a : a - b));
        kept = sorted.slice(0, k);
      }

      const sub = kept.reduce((acc, v) => acc + v, 0) * sign;
      total += sub;
      terms.push({
        type: 'dice',
        sign,
        count,
        sides,
        keepMode,
        keepCount,
        rolls,
        kept,
        subtotal: sub,
      });
    } else if (m[6]) {
      const val = parseInt(m[6], 10) * sign;
      total += val;
      terms.push({ type: 'mod', value: val });
    }
  }

  if (matchedLen !== cleaned.length || terms.length === 0) {
    throw new Error('Expressão de dados inválida');
  }

  return { expr: cleaned, terms, total };
}

export function formatRollSummary(result) {
  const parts = result.terms.map((t, idx) => {
    if (t.type === 'mod') {
      return t.value >= 0 ? (idx === 0 ? `${t.value}` : `+ ${t.value}`) : `- ${Math.abs(t.value)}`;
    }
    const prefix = t.sign < 0 ? '- ' : idx > 0 ? '+ ' : '';
    const detail = t.keepMode
      ? `[${t.rolls.join(', ')} → ${t.kept.join(', ')}]`
      : `[${t.rolls.join(', ')}]`;
    return `${prefix}${t.count}d${t.sides}${detail}`;
  });
  return `${parts.join(' ')} = ${result.total}`;
}
