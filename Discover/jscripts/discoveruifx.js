const carousels = {
  music: { index: 0, visible: 6, selector: '#music-track' },
  books: { index: 0, visible: 5, selector: '#books-track' },
};

function slide(id, dir) {
  const c = carousels[id];
  const track = document.querySelector(c.selector);
  const cards = track.children;
  const total = cards.length;
  const maxIndex = total - c.visible;
  c.index = Math.max(0, Math.min(c.index + dir, maxIndex));
  const cardWidth = cards[0].offsetWidth + 16;
  track.style.transform = `translateX(-${c.index * cardWidth}px)`;
}

document.querySelectorAll('.heart-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    btn.style.color = btn.textContent === '♡' ? '#e05070' : '#c97d87';
    btn.textContent = btn.textContent === '♡' ? '♥' : '♡';
  });
});