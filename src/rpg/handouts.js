/**
 * Gerenciador de Handouts (exibição de textos ou imagens enviadas pelo Mestre).
 */

export class HandoutModal {
  constructor({ modalEl, titleEl, textEl, imgEl, closeBtn }) {
    this.modalEl = modalEl;
    this.titleEl = titleEl;
    this.textEl = textEl;
    this.imgEl = imgEl;
    this.closeBtn = closeBtn;
    this.objectUrl = null;

    this.closeBtn?.addEventListener('click', () => this.hide());
  }

  showText(title, text) {
    this.#clearImg();
    this.titleEl.textContent = title || 'Handout';
    this.textEl.textContent = text || '';
    this.textEl.style.display = text ? 'block' : 'none';
    this.imgEl.style.display = 'none';
    this.modalEl.style.display = 'flex';
  }

  showImage(title, mime, bytes, text = '') {
    this.#clearImg();
    const blob = new Blob([bytes], { type: mime || 'image/png' });
    this.objectUrl = URL.createObjectURL(blob);
    this.titleEl.textContent = title || 'Handout';
    this.textEl.textContent = text;
    this.textEl.style.display = text ? 'block' : 'none';
    this.imgEl.src = this.objectUrl;
    this.imgEl.style.display = 'block';
    this.modalEl.style.display = 'flex';
  }

  hide() {
    this.modalEl.style.display = 'none';
    this.#clearImg();
  }

  #clearImg() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.imgEl.src = '';
  }
}
