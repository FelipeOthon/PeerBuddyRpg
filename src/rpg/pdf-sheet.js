/**
 * Renderizador de Fichas em PDF Editáveis (estilo Firecast) usando pdf.js local.
 * Suporta múltiplas páginas (Frente/Verso), campos AcroForm nativos, campos manuais
 * sobrepostos, Salvar Ficha / Reverter Ficha e sincronização P2P dos valores.
 */

import * as pdfjsLib from '../vendor/pdfjs/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

export class PdfSheetViewer {
  constructor(containerEl, { onSave, readOnly = false } = {}) {
    this.container = containerEl;
    this.onSave = onSave || (() => {});
    this.readOnly = readOnly;

    this.pdfDoc = null;
    this.currentPage = 1;
    this.scale = 1.25;
    this.sheet = null;
    this.draftValues = {};
    this.draftCustomFields = [];
    this.addingManualField = false;
  }

  async render(sheet, pdfBytes, readOnly = false) {
    this.sheet = sheet;
    this.readOnly = readOnly;
    this.draftValues = { ...(sheet.pdfValues || {}) };
    this.draftCustomFields = Array.isArray(sheet.customOverlayFields)
      ? sheet.customOverlayFields.map((f) => ({ ...f }))
      : [];
    this.currentPage = 1;

    this.container.innerHTML = '';
    if (!pdfBytes) {
      this.container.innerHTML = '<div class="hint">Aguardando arquivo PDF da ficha...</div>';
      return;
    }

    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes) });
    this.pdfDoc = await loadingTask.promise;
    this.#buildShell();
    await this.#renderPage(1);
  }

  #buildShell() {
    const bar = document.createElement('div');
    bar.className = 'row';
    bar.style.marginBottom = '6px';
    bar.style.justifyContent = 'space-between';

    const left = document.createElement('div');
    left.className = 'row';
    if (!this.readOnly) {
      const btnSave = document.createElement('button');
      btnSave.className = 'primary';
      btnSave.textContent = '💾 Salvar Ficha';
      btnSave.onclick = () => {
        this.sheet.pdfValues = { ...this.draftValues };
        this.sheet.customOverlayFields = this.draftCustomFields.map((f) => ({ ...f }));
        this.onSave(this.sheet);
      };

      const btnRevert = document.createElement('button');
      btnRevert.className = 'secondary';
      btnRevert.textContent = '↩ Reverter Ficha';
      btnRevert.onclick = () => {
        this.draftValues = { ...(this.sheet.pdfValues || {}) };
        this.draftCustomFields = Array.isArray(this.sheet.customOverlayFields)
          ? this.sheet.customOverlayFields.map((f) => ({ ...f }))
          : [];
        this.#renderPage(this.currentPage);
      };

      const btnAddField = document.createElement('button');
      btnAddField.className = 'secondary';
      btnAddField.textContent = '+ Campo Manual';
      btnAddField.title = 'Clique no PDF para adicionar uma caixa de texto editável (ideal para PDFs sem formulário)';
      btnAddField.onclick = () => {
        this.addingManualField = !this.addingManualField;
        btnAddField.className = this.addingManualField ? 'active-tool' : 'secondary';
      };

      left.append(btnSave, btnRevert, btnAddField);
    }

    const pagesRow = document.createElement('div');
    pagesRow.className = 'row';
    const numPages = this.pdfDoc.numPages;
    for (let p = 1; p <= numPages; p++) {
      const tab = document.createElement('button');
      tab.className = p === this.currentPage ? 'active-tool' : 'secondary';
      tab.textContent = numPages === 2 ? (p === 1 ? 'Frente' : 'Verso') : `Pág. ${p}`;
      tab.onclick = async () => {
        this.currentPage = p;
        pagesRow.querySelectorAll('button').forEach((b, i) => {
          b.className = i + 1 === p ? 'active-tool' : 'secondary';
        });
        await this.#renderPage(p);
      };
      pagesRow.appendChild(tab);
    }

    bar.append(left, pagesRow);
    this.container.appendChild(bar);

    const stage = document.createElement('div');
    stage.id = 'pdfPageStage';
    stage.style.cssText = 'position:relative; overflow:auto; max-height:520px; border:1px solid #3b445c; background:#fff; border-radius:4px;';
    this.stage = stage;
    this.container.appendChild(stage);
  }

  async #renderPage(pageNum) {
    if (!this.pdfDoc || !this.stage) return;
    this.stage.innerHTML = '';

    const page = await this.pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: this.scale });

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:relative; width:${viewport.width}px; height:${viewport.height}px; margin:0 auto;`;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;

    wrapper.appendChild(canvas);

    // Clique para adicionar campo manual (para PDFs sem AcroForm)
    wrapper.addEventListener('click', (e) => {
      if (!this.addingManualField || this.readOnly) return;
      const rect = wrapper.getBoundingClientRect();
      const xPct = ((e.clientX - rect.left) / viewport.width) * 100;
      const yPct = ((e.clientY - rect.top) / viewport.height) * 100;
      const id = `manual-${Date.now().toString(36)}`;
      this.draftCustomFields.push({ id, page: pageNum, xPct, yPct, wPct: 16, hPct: 3.5 });
      this.addingManualField = false;
      this.#renderPage(pageNum);
    });

    // Camada 1: Campos AcroForm nativos do PDF
    const annotations = await page.getAnnotations();
    annotations.forEach((ann, idx) => {
      if (ann.subtype !== 'Widget') return;
      const fieldKey = ann.fieldName || `p${pageNum}_w${idx}`;
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(ann.rect);
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.max(18, Math.abs(x2 - x1));
      const height = Math.max(16, Math.abs(y2 - y1));

      if (ann.fieldType === 'Btn' && ann.checkBox) {
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = Boolean(this.draftValues[fieldKey] ?? (ann.fieldValue && ann.fieldValue !== 'Off'));
        cb.disabled = this.readOnly;
        cb.style.cssText = `position:absolute; left:${left}px; top:${top}px; width:${width}px; height:${height}px; margin:0; cursor:pointer;`;
        cb.onchange = () => {
          this.draftValues[fieldKey] = cb.checked;
        };
        wrapper.appendChild(cb);
      } else if (ann.fieldType === 'Tx') {
        const isMultiline = Boolean(ann.multiLine) || height > 38;
        const inp = document.createElement(isMultiline ? 'textarea' : 'input');
        if (!isMultiline) inp.type = 'text';
        inp.value = this.draftValues[fieldKey] ?? ann.fieldValue ?? '';
        inp.readOnly = this.readOnly;
        inp.style.cssText = `position:absolute; left:${left}px; top:${top}px; width:${width}px; height:${height}px; background:rgba(255,255,255,0.72); color:#991b1b; border:1px solid rgba(56,189,248,0.45); font-size:12px; font-weight:600; padding:1px 3px; resize:none;`;
        inp.oninput = () => {
          this.draftValues[fieldKey] = inp.value;
        };
        wrapper.appendChild(inp);
      }
    });

    // Camada 2: Campos manuais sobrepostos (para PDFs planos)
    this.draftCustomFields
      .filter((f) => f.page === pageNum)
      .forEach((f) => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = this.draftValues[f.id] ?? '';
        inp.readOnly = this.readOnly;
        inp.style.cssText = `position:absolute; left:${f.xPct}%; top:${f.yPct}%; width:${f.wPct}%; height:${f.hPct}%; background:rgba(255,255,255,0.85); color:#991b1b; border:1px dashed #0284c7; font-size:12px; font-weight:600; padding:1px 4px;`;
        inp.oninput = () => {
          this.draftValues[f.id] = inp.value;
        };
        wrapper.appendChild(inp);
      });

    this.stage.appendChild(wrapper);
  }
}
