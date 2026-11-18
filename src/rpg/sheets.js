/**
 * Fichas de Personagem (Templates D&D 5e e Genérico/Customizável) e Macros.
 */

export function calcDndMod(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 0;
  return Math.floor((n - 10) / 2);
}

export function formatMod(mod) {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function createDefaultSheet(template = 'dnd5e', owner = 'Jogador') {
  if (template === 'generic') {
    return {
      id: `sheet-${Date.now().toString(36)}`,
      template: 'generic',
      name: 'Novo Personagem',
      owner,
      hp: 20,
      hpMax: 20,
      defense: 12,
      notes: '',
      customFields: [
        { label: 'Força', value: '3', rollExpr: '1d20+3' },
        { label: 'Agilidade', value: '2', rollExpr: '1d20+2' },
        { label: 'Mente', value: '1', rollExpr: '1d20+1' },
      ],
      macros: [
        { id: 'mac-1', name: 'Ataque Básico', expr: '1d20+3' },
        { id: 'mac-2', name: 'Dano', expr: '1d8+3' },
      ],
    };
  }

  return {
    id: `sheet-${Date.now().toString(36)}`,
    template: 'dnd5e',
    name: 'Aventureiro',
    classLevel: 'Guerreiro Nv. 1',
    owner,
    hp: 12,
    hpMax: 12,
    ca: 16,
    speed: '9 m',
    proficiency: 2,
    stats: {
      FOR: 16,
      DES: 12,
      CON: 14,
      INT: 10,
      SAB: 11,
      CAR: 8,
    },
    notes: '',
    macros: [
      { id: 'mac-atk', name: 'Espada Longa (Atq)', expr: '1d20+5' },
      { id: 'mac-dmg', name: 'Espada Longa (Dano)', expr: '1d8+3' },
      { id: 'mac-init', name: 'Iniciativa', expr: '1d20+1' },
    ],
  };
}

export function addMacroToSheet(sheet, name, expr) {
  if (!sheet.macros) sheet.macros = [];
  const macro = {
    id: `mac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: String(name || 'Macro').trim(),
    expr: String(expr || '1d20').trim(),
  };
  sheet.macros.push(macro);
  return macro;
}

export function removeMacroFromSheet(sheet, macroId) {
  if (!sheet.macros) return;
  sheet.macros = sheet.macros.filter((m) => m.id !== macroId);
}
