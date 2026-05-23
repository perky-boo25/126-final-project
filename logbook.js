document.addEventListener('DOMContentLoaded', () => {
  const tabGroups = Array.from(document.querySelectorAll('.tab-group'));
  const wrapper   = document.querySelector('.tabs-wrapper');
  const BASE_HEIGHT = 600;

  // Snapshot original pixel tops before any JS manipulation
  const baseTops = tabGroups.map(g => g.offsetTop);

  function getFolderHeight(group) {
    // transform: scaleY(0) is purely visual — scrollHeight still reflects
    // the full layout height, so we can measure without any hacks.
    const overlay = group.querySelector('.folder-overlay');
    return overlay ? overlay.scrollHeight : 280;
  }

  function applyPositions() {
    // Walk tabs top-to-bottom, accumulating extra shift from each open folder
    let cumulativeShift = 0;

    tabGroups.forEach((group, i) => {
      group.style.top = (baseTops[i] + cumulativeShift) + 'px';

      if (group.classList.contains('open')) {
        const folderH    = getFolderHeight(group);
        const slotHeight = i + 1 < baseTops.length
          ? baseTops[i + 1] - baseTops[i]
          : 120;
        cumulativeShift += Math.max(0, folderH + 20 - slotHeight);
      }
    });

    wrapper.style.height = (BASE_HEIGHT + cumulativeShift) + 'px';
  }

  function toggleTab(group) {
    group.classList.toggle('open');
    applyPositions();
  }

  function closeAll() {
    tabGroups.forEach(g => g.classList.remove('open'));
    applyPositions();
  }

  tabGroups.forEach(group => {
    const header = group.querySelector('.tab-header');
    header.addEventListener('click', () => toggleTab(group));

    const overlay = group.querySelector('.folder-overlay');
    if (overlay) {
      // Clicking the folder background (the pink image area) retracts the folder
      overlay.addEventListener('click', () => toggleTab(group));

      // But clicking on the actual entry content should NOT close it
      const entries = overlay.querySelector('.folder-entries');
      if (entries) entries.addEventListener('click', e => e.stopPropagation());

      // × button also retracts just this folder
      const closeBtn = document.createElement('button');
      closeBtn.className = 'close-hint';
      closeBtn.innerHTML = '&times;';
      closeBtn.title     = 'Close';
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        toggleTab(group);
      });
      overlay.appendChild(closeBtn);
    }
  });
});