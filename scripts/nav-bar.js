(function () {
  const NAVBAR_URL = '/webpages/nav-bar.html';
  const NAV_CSS    = '/styles/nav-bar.css';

  function injectCSS() {
    if (!document.querySelector(`link[href="${NAV_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel  = 'stylesheet';
      link.href = NAV_CSS;
      document.head.appendChild(link);
    }
  }

  function setActiveLink(nav) {
    const currentPage = window.location.pathname.split('/').pop(); // e.g. "discover.html"
    nav.querySelectorAll('.nav-links a').forEach(a => {
      a.classList.remove('nav-active');
      const linkPage = a.getAttribute('href')?.split('/').pop();
      if (linkPage && linkPage === currentPage) {
        a.classList.add('nav-active');
      }
    });
  }

  function loadNavbar() {
    const placeholder = document.getElementById('navbar-placeholder');
    if (!placeholder) {
      console.warn('nav-bar.js: No #navbar-placeholder found.');
      return;
    }

    fetch(NAVBAR_URL)
      .then(res => {
        if (!res.ok) throw new Error(`Failed to fetch navbar: ${res.status}`);
        return res.text();
      })
      .then(html => {
        const parser = new DOMParser();
        const doc    = parser.parseFromString(html, 'text/html');
        const nav    = doc.querySelector('nav');

        if (!nav) {
          console.warn('nav-bar.js: No <nav> found in navbar.html.');
          return;
        }

        injectCSS();
        setActiveLink(nav);
        placeholder.replaceWith(nav);
      })
      .catch(err => console.error('nav-bar.js:', err));
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }
})();