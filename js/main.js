/* =============================================
   MOTO TALLER EL MAY — main.js
   ============================================= */

// ---- Navbar scroll effect ----
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ---- Hamburger menu ----
const hamburger = document.getElementById('hamburger');
const navLinks = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('active');
  navLinks.classList.toggle('open');
  document.body.style.overflow = navLinks.classList.contains('open') ? 'hidden' : '';
});

// Close menu when a link is clicked
navLinks.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('active');
    navLinks.classList.remove('open');
    document.body.style.overflow = '';
  });
});

// ---- Active nav link on scroll ----
const sections = document.querySelectorAll('section[id]');
const navAnchors = document.querySelectorAll('.nav-links a');

const observerOptions = { rootMargin: '-40% 0px -55% 0px' };
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navAnchors.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, observerOptions);

sections.forEach(s => sectionObserver.observe(s));

// ---- Gallery loader (progressive) ----
const GALLERY_PAGE_SIZE = 12;

async function loadGallery() {
  const grid = document.getElementById('galeriaGrid');
  const verMasWrapper = document.getElementById('galeriaVerMas');
  const btnVerMas = document.getElementById('btnVerMas');
  if (!grid) return;

  const PLACEHOLDER_ICONS = ['fa-motorcycle', 'fa-wrench', 'fa-cogs', 'fa-tint', 'fa-cube', 'fa-tools'];

  function renderPlaceholders() {
    grid.innerHTML = PLACEHOLDER_ICONS.map(icon =>
      `<div class="galeria-item placeholder"><i class="fas ${icon}"></i><span>Próximamente</span></div>`
    ).join('');
  }

  function renderItems(items) {
    return items.map((img) => `
      <div class="galeria-item">
        <img src="img/galeria/${img.file}"
             alt="${img.caption || 'Reparación de motocicleta en Córdoba Veracruz'}"
             loading="lazy"
             width="400" height="300"
             style="cursor:pointer"
             onclick="openLightbox('img/galeria/${img.file}', '${(img.caption || '').replace(/'/g, "\\'")}')"/>
        ${img.caption ? `<div class="galeria-caption">${img.caption}</div>` : ''}
      </div>`).join('');
  }

  function revealNewItems() {
    grid.querySelectorAll('.galeria-item:not(.revealed)').forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
      el.dataset.delay = (i % 4) * 80;
      revealObserver.observe(el);
    });
  }

  try {
    const res = await fetch('gallery.json');
    if (!res.ok) throw new Error('no json');
    const data = await res.json();
    const visible = (data.images || []).filter(img => img.visible !== false);

    if (visible.length === 0) { renderPlaceholders(); return; }

    let offset = 0;

    function loadPage() {
      const batch = visible.slice(offset, offset + GALLERY_PAGE_SIZE);
      grid.insertAdjacentHTML('beforeend', renderItems(batch));
      offset += batch.length;
      revealNewItems();

      // Show/hide "Ver más" button
      if (offset >= visible.length) {
        if (verMasWrapper) verMasWrapper.style.display = 'none';
      } else {
        if (verMasWrapper) verMasWrapper.style.display = 'flex';
      }
    }

    loadPage();

    if (btnVerMas) {
      btnVerMas.addEventListener('click', () => {
        const previousOffset = offset; // guardar ANTES de loadPage()
        loadPage();
        // Smooth scroll to first new item
        const newItems = grid.querySelectorAll('.galeria-item');
        if (newItems[previousOffset]) {
          setTimeout(() => {
            newItems[previousOffset].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 100);
        }
      });
    }

  } catch (err) {
    console.error('[Galería] Error al cargar gallery.json:', err);
    renderPlaceholders();
  }
}

// ---- Scroll reveal animation ----
const revealElements = document.querySelectorAll(
  '.service-card, .dif-card, .acc-card, .info-item, .contacto-form'
);

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('revealed');
      }, (entry.target.dataset.delay || 0));
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

revealElements.forEach((el, i) => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  el.style.willChange = 'opacity, transform';
  el.dataset.delay = (i % 4) * 80;
  revealObserver.observe(el);
});



// ---- WhatsApp form submit ----
const form = document.getElementById('contactoForm');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const nombre = document.getElementById('nombre').value.trim();
    const telefono = document.getElementById('telefono').value.trim();
    const moto = document.getElementById('moto').value.trim();
    const servicio = document.getElementById('servicio').value;
    const mensaje = document.getElementById('mensaje').value.trim();

    let text = `Hola, soy *${nombre}*`;
    if (telefono) text += ` (Tel: ${telefono})`;
    if (moto) text += `\n🏍️ Moto: *${moto}*`;
    if (servicio) text += `\n🔧 Servicio: *${servicio}*`;
    if (mensaje) text += `\n📝 ${mensaje}`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/522711651362?text=${encoded}`, '_blank');
  });
}

// ---- Smooth scroll for anchor links ----
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      const offset = 80;
      const top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

// ---- Hero parallax subtle effect (desktop only) ----
const heroBg = document.querySelector('.hero-bg');
if (heroBg && window.innerWidth > 768) {
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY;
    if (scrolled < window.innerHeight) {
      heroBg.style.transform = `translateY(${scrolled * 0.3}px)`;
    }
  }, { passive: true });
}

// ---- FAQ Accordion ----
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    // Close all
    document.querySelectorAll('.faq-question').forEach(b => {
      b.setAttribute('aria-expanded', 'false');
      b.closest('.faq-item').classList.remove('open');
    });
    // Toggle current
    if (!isOpen) {
      btn.setAttribute('aria-expanded', 'true');
      btn.closest('.faq-item').classList.add('open');
    }
  });
});

// ---- Load gallery on page ready ----
loadGallery();

// ---- Lightbox nativo ----
(function () {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    display:none; position:fixed; inset:0; z-index:9000;
    background:rgba(0,0,0,0.92); align-items:center;
    justify-content:center; cursor:pointer;
  `;
  overlay.innerHTML = `
    <img id="lb-img" style="max-width:90vw;max-height:88vh;border-radius:8px;display:block;" />
    <p id="lb-cap" style="position:fixed;bottom:24px;left:0;right:0;text-align:center;
       color:#ccc;font-family:sans-serif;font-size:0.9rem;padding:0 24px;"></p>
    <button id="lb-close" aria-label="Cerrar" style="position:fixed;top:20px;right:24px;
       background:none;border:none;color:#fff;font-size:2rem;cursor:pointer;line-height:1;">
      &times;
    </button>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.id === 'lb-close') close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  function close() {
    overlay.style.display = 'none';
    document.body.style.overflow = '';
  }

  window.openLightbox = function (src, caption) {
    document.getElementById('lb-img').src = src;
    document.getElementById('lb-cap').textContent = caption || '';
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  };
})();

