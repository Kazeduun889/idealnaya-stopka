/* =============================================
   STACK PERFECT — ИГРОВОЙ ДВИЖОК v0.2
   Telegram Mini App | Vanilla JS + Canvas
   Редизайн: Poppins, glassmorphism, HTML-оверлеи
   ============================================= */

'use strict';

// =============================================
//  КОНФИГУРАЦИЯ ИГРЫ
// =============================================
const CONFIG = {
  // --- Базовый блок (стартовая платформа) ---
  BASE_WIDTH:        200,     // стартовая ширина платформы (px)
  BASE_HEIGHT:       40,      // высота платформы
  BASE_Y_OFFSET:     0.12,   // отступ от нижнего края экрана (доля высоты)

  // --- Движущийся блок ---
  BLOCK_HEIGHT:      30,      // высота каждого блока
  SPAWN_Y_RATIO:     0.30,   // позиция спавна блока (доля высоты от верха)
  BLOCK_SPEED:       2.5,    // начальная скорость (пикс/кадр при 60fps)
  SPEED_INCREASE:    0.12,   // прирост скорости за каждый уровень

  // --- Камера ---
  CAM_LERP:          0.10,   // коэффициент плавности (0..1, меньше = плавнее)

  // --- Частицы (обрезанный кусок) ---
  PARTICLE_COUNT_MIN: 7,     // минимум частиц при обрезке
  PARTICLE_COUNT_MAX: 12,    // максимум частиц
  PARTICLE_SIZE_MIN:  4,     //最小 размер частицы (px)
  PARTICLE_SIZE_MAX:  10,    //最大 размер частицы
  PARTICLE_GRAVITY:   0.45,  // гравитация частиц
  PARTICLE_FRICTION:  0.98,  // трение по воздуху

  // --- Таймеры ---
  SPAWN_DELAY:        180,   // задержка перед спавном следующего блока (мс)
};

// =============================================
//  СПИСОК ЦВЕТНЫХ БЛОКОВ (имена файлов в assets/)
// =============================================
const BLOCK_IMAGE_NAMES = [
  'black',
  'blue',
  'green',
  'grey',
  'orange',
  'pink',
  'purple',
  'red',
  'yellow',
];

// =============================================
//  СИСТЕМА КОЛЛЕКЦИЙ (Инвентарь)
// =============================================
const COLLECTIONS = [
  {
    id: 'basic_colors',
    name: 'Базовые цвета',
    description: 'Стартовый набор ярких глянцевых блоков',
    platform: 'assets/platform.png',
    blocks: ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'grey', 'black'],
    color: '#4ecdc4',
    locked: false,
  },
];

// =============================================
//  СИСТЕМА ЗАГРУЗКИ АССЕТОВ
// =============================================
class AssetLoader {
  constructor() {
    /** @type {Object<string, HTMLImageElement>} загруженные изображения */
    this.images = {};
    this.loaded = 0;
    this.total  = 0;
  }

  /**
   * Загружает все изображения из assets/
   * @returns {Promise<void>}
   */
  async loadAll() {
    const files = [
      { key: 'bg',       src: 'assets/bg.png' },
      { key: 'bg_menu',  src: 'assets/bg_menu.png' },
      { key: 'platform', src: 'assets/platform.png' },
      { key: 'coin',     src: 'assets/coin.png' },
      ...BLOCK_IMAGE_NAMES.map(name => ({
        key: name,
        src: `assets/${name}.png`,
      })),
    ];

    this.total = files.length;
    const promises = files.map(file => this._loadImage(file.key, file.src));
    await Promise.all(promises);
  }

  /** Загружает одно изображение */
  _loadImage(key, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.images[key] = img;
        this.loaded++;
        this._updateProgress();
        resolve();
      };
      img.onerror = () => {
        console.warn(`[AssetLoader] Не удалось загрузить: ${src}, создаю заглушку`);
        this.images[key] = this._createFallbackImage(key);
        this.loaded++;
        this._updateProgress();
        resolve();
      };
      img.src = src;
    });
  }

  /** Создаёт заглушку — цветной canvas, если PNG не загрузился */
  _createFallbackImage(key) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const cx = c.getContext('2d');
    const colors = {
      bg: '#1a1a3e',
      bg_menu: '#1a1a3e',
      platform: '#888',
      black: '#222', blue: '#4a90d9', green: '#27ae60',
      grey: '#aaa', orange: '#f39c12', pink: '#e91e8f',
      purple: '#8e44ad', red: '#e74c3c', yellow: '#f1c40f',
    };
    cx.fillStyle = colors[key] || '#ccc';
    cx.fillRect(0, 0, 64, 64);
    return c;
  }

  /** Обновляет полосу прогресса */
  _updateProgress() {
    const pct = this.total > 0 ? (this.loaded / this.total) * 100 : 0;
    const bar = document.getElementById('loaderBarFill');
    if (bar) bar.style.width = pct + '%';
  }

  /** Прячет экран загрузки */
  hideLoadingScreen() {
    const screen = document.getElementById('loadingScreen');
    if (screen) {
      screen.classList.add('hidden');
      setTimeout(() => { screen.style.display = 'none'; }, 700);
    }
  }
}

// =============================================
//  СИСТЕМА ЧАСТИЦ (Эффект обрезки блока)
// =============================================
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /**
   * Создаёт взрыв частиц из обрезанного куска блока
   */
  emit(x, y, width, height, color) {
    const count = CONFIG.PARTICLE_COUNT_MIN +
      Math.floor(Math.random() * (CONFIG.PARTICLE_COUNT_MAX - CONFIG.PARTICLE_COUNT_MIN + 1));

    for (let i = 0; i < count; i++) {
      const px = x + Math.random() * width;
      const py = y + Math.random() * height;
      const size = CONFIG.PARTICLE_SIZE_MIN +
        Math.random() * (CONFIG.PARTICLE_SIZE_MAX - CONFIG.PARTICLE_SIZE_MIN);
      const vx = (Math.random() - 0.5) * 3;
      const vy = -Math.random() * 2 + 1;

      this.particles.push({
        x: px, y: py, size, color,
        vx, vy,
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  /** Обновляет состояние всех частиц */
  update(dt) {
    const f = dt / 16.67;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.vy += CONFIG.PARTICLE_GRAVITY * f;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vx *= CONFIG.PARTICLE_FRICTION;
      p.vy *= CONFIG.PARTICLE_FRICTION;
      p.rotation += p.rotSpeed * f;
      p.alpha -= 0.015 * f;
      if (p.alpha <= 0 || p.y > window.innerHeight + 50) {
        this.particles.splice(i, 1);
      }
    }
  }

  /** Рисует все частицы */
  draw(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  clear() {
    this.particles = [];
  }
}

// =============================================
//  КАМЕРА (Плавное смещение по Y)
// =============================================
class Camera {
  constructor() {
    this.currentY = 0;
    this.targetY  = 0;
  }

  setTarget(newY) {
    if (newY > this.targetY) this.targetY = newY;
  }

  update(dt) {
    const t = 1 - Math.pow(1 - CONFIG.CAM_LERP, dt / 16.67);
    this.currentY += (this.targetY - this.currentY) * t;
  }

  reset() {
    this.currentY = 0;
    this.targetY  = 0;
  }
}

// =============================================
//  ИГРОВОЙ ДВИЖОК
// =============================================
class Game {
  constructor() {
    // --- Canvas ---
    this.canvas = document.getElementById('gameCanvas');
    this.ctx    = this.canvas.getContext('2d');

    // --- Offscreen canvas для размытого фона ---
    this._bgBlurCanvas = document.createElement('canvas');
    this._bgBlurCtx    = this._bgBlurCanvas.getContext('2d');
    this._bgBlurReady  = false;

    // --- Загрузчик ассетов ---
    this.assets = new AssetLoader();

    // --- Системы ---
    this.particles = new ParticleSystem();
    this.camera    = new Camera();

    // --- Игровое состояние ---
    this.state     = 'loading';  // loading | menu | playing | gameover
    this.score     = 0;
    this.bestScore = this._loadBestScore();
    this.coins     = this._loadCoins();  // общий баланс монет
    this.sessionCoinsEarned = 0;          // заработано за текущую сессию

    // --- Коллекции ---
    this.activeCollectionId = this._loadActiveCollection();
    this.activeCollection   = COLLECTIONS.find(c => c.id === this.activeCollectionId) || COLLECTIONS[0];

    // --- Блоки ---
    this.blocks      = [];
    this.movingBlock = null;
    this.direction   = 1;

    // --- Время ---
    this.lastTime = 0;

    // --- Размер canvas ---
    this.W = 0;
    this.H = 0;
    this.dpr = 1;

    // HTML-элементы
    this.elMenu      = document.getElementById('menuOverlay');
    this.elHud       = document.getElementById('hudOverlay');
    this.elScoreVal  = document.getElementById('scoreValue');
    this.elCoinVal   = document.getElementById('coinValue');
    this.elGameOver  = document.getElementById('gameOverOverlay');
    this.elFinalSc   = document.getElementById('finalScore');
    this.elBestSc    = document.getElementById('bestScore');
    this.elModalCoins= document.getElementById('modalCoins');
    this.elSessionEarned = document.getElementById('sessionEarned');
    this.elInventory     = document.getElementById('inventoryOverlay');
    this.elInventoryList = document.getElementById('inventoryList');

    this._setupCanvas();
    this._setupInput();
  }

  // ===========================================
  //  ИНИЦИАЛИЗАЦИЯ
  // ===========================================

  _setupCanvas() {
    this.dpr = window.devicePixelRatio || 1;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width  = this.W * this.dpr;
    this.canvas.height = this.H * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    window.addEventListener('resize', () => {
      this.dpr = window.devicePixelRatio || 1;
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.canvas.width  = this.W * this.dpr;
      this.canvas.height = this.H * this.dpr;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._bgBlurReady = false; // пересоздаём offscreen при resize
    });
  }

  _setupInput() {
    // Клик по canvas — бросок блока (только во время игры)
    this.canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.state === 'playing' && this.movingBlock) {
        this._dropBlock();
      }
    });

    // Кнопки HTML
    document.getElementById('btnPlay').addEventListener('click', () => {
      if (this.state === 'menu') this._resetGame();
    });
    document.getElementById('btnPlay').addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.state === 'menu') this._resetGame();
    });

    document.getElementById('btnRestart').addEventListener('click', () => {
      if (this.state === 'gameover') this._resetGame();
    });
    document.getElementById('btnRestart').addEventListener('touchend', (e) => {
      e.preventDefault();
      if (this.state === 'gameover') this._resetGame();
    });

    // Кнопка «Инвентарь»
    document.getElementById('btnInventory').addEventListener('click', () => {
      this._openInventory();
    });
    document.getElementById('btnInventory').addEventListener('touchend', (e) => {
      e.preventDefault();
      this._openInventory();
    });

    // Закрытие инвентаря
    document.getElementById('btnCloseInventory').addEventListener('click', () => {
      this._closeInventory();
    });
    document.getElementById('btnCloseInventory').addEventListener('touchend', (e) => {
      e.preventDefault();
      this._closeInventory();
    });

    // Предотвращаем зум и скролл
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  async start() {
    this._initTelegram();
    await this.assets.loadAll();
    this.assets.hideLoadingScreen();
    this.state = 'menu';
    this._updateOverlays();
    requestAnimationFrame((t) => this._gameLoop(t));
  }

  _initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
    }
  }

  // ===========================================
  //  УПРАВЛЕНИЕ HTML-ОВЕРЛЕЯМИ
  // ===========================================

  _updateOverlays() {
    switch (this.state) {
      case 'menu':
        this.elMenu.classList.remove('hidden');
        this.elHud.classList.add('hidden');
        this.elGameOver.classList.add('hidden');
        break;
      case 'playing':
        this.elMenu.classList.add('hidden');
        this.elHud.classList.remove('hidden');
        this.elGameOver.classList.add('hidden');
        break;
      case 'gameover':
        this.elMenu.classList.add('hidden');
        this.elHud.classList.add('hidden');
        this.elGameOver.classList.remove('hidden');
        this.elFinalSc.textContent = this.score;
        this.elBestSc.textContent  = this.bestScore;
        this.elSessionEarned.textContent = '+' + this.sessionCoinsEarned;
        break;
    }
  }

  _updateScoreDisplay() {
    this.elScoreVal.textContent = this.score;
    this.elCoinVal.textContent = this.coins;
  }

  // ===========================================
  //  ИНВЕНТАРЬ / КОЛЛЕКЦИИ
  // ===========================================

  _openInventory() {
    this._renderInventory();
    this.elInventory.classList.remove('hidden');
  }

  _closeInventory() {
    this.elInventory.classList.add('hidden');
  }

  _renderInventory() {
    let html = '';
    for (const col of COLLECTIONS) {
      const isActive = col.id === this.activeCollectionId;
      const isLocked = col.locked;

      // Превью: только цветные блоки
      let preview = '';
      for (let i = 0; i < col.blocks.length; i++) {
        preview += `<span class="inv-preview-block" style="background:${this._getBlockColorByName(col.blocks[i])}"></span>`;
      }

      const btnClass = isActive ? 'inv-btn inv-btn-active' : (isLocked ? 'inv-btn inv-btn-locked' : 'inv-btn');
      const btnText  = isActive ? 'ВЫБРАНО' : (isLocked ? 'ЗАБЛОКИРОВАНО' : 'ВЫБРАТЬ');
      const btnDisabled = isActive || isLocked ? 'disabled' : '';

      html += `
        <div class="inv-card">
          <div class="inv-card-header">
            <h3 class="inv-card-name">${col.name}</h3>
            <span class="inv-card-desc">${col.description}</span>
          </div>
          <div class="inv-card-preview">${preview}</div>
          <button class="${btnClass}" ${btnDisabled} data-col-id="${col.id}">${btnText}</button>
        </div>`;
    }
    this.elInventoryList.innerHTML = html;

    // Вешаем обработчики на кнопки выбора
    this.elInventoryList.querySelectorAll('.inv-btn:not(.inv-btn-active):not(.inv-btn-locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        this._selectCollection(btn.dataset.colId);
      });
    });
  }

  _selectCollection(colId) {
    this.activeCollectionId = colId;
    this.activeCollection = COLLECTIONS.find(c => c.id === colId) || COLLECTIONS[0];
    this._saveActiveCollection(colId);
    this._renderInventory();
  }

  _getBlockColorByName(name) {
    const map = {
      red: '#e74c3c', blue: '#4a90d9', green: '#27ae60',
      yellow: '#f1c40f', orange: '#f39c12', pink: '#e91e8f',
      purple: '#8e44ad', grey: '#aaaaaa', black: '#222222',
    };
    return map[name] || '#cccccc';
  }

  _loadActiveCollection() {
    try {
      return localStorage.getItem('sp_active_collection') || 'basic_colors';
    } catch { return 'basic_colors'; }
  }

  _saveActiveCollection(id) {
    try {
      localStorage.setItem('sp_active_collection', id);
    } catch { /* игнорируем */ }
  }

  // ===========================================
  //  УПРАВЛЕНИЕ ИГРОВЫМ СОСТОЯНИЕМ
  // ===========================================

  _resetGame() {
    this.blocks      = [];
    this.movingBlock = null;
    this.camera.reset();
    this.particles.clear();
    this.score       = 0;
    this.sessionCoinsEarned = 0;
    this.state       = 'playing';
    this._updateScoreDisplay();
    this._updateOverlays();

    // Пересоздаём offscreen blur-фон
    this._bgBlurReady = false;

    // Стартовая платформа
    const base = this._createBlock(
      (this.W - CONFIG.BASE_WIDTH) / 2,
      this.H - this.H * CONFIG.BASE_Y_OFFSET - CONFIG.BASE_HEIGHT,
      CONFIG.BASE_WIDTH,
      CONFIG.BASE_HEIGHT,
      'platform'
    );
    this.blocks.push(base);
    this._spawnMovingBlock();
  }

  _createBlock(x, y, width, height, imageKey) {
    return { x, y, width, height, imageKey };
  }

  _spawnMovingBlock() {
    const topBlock = this.blocks[this.blocks.length - 1];
    const w = topBlock.width;
    const randomKey = BLOCK_IMAGE_NAMES[
      Math.floor(Math.random() * BLOCK_IMAGE_NAMES.length)
    ];

    this.movingBlock = this._createBlock(
      this.W / 2 - w / 2,
      topBlock.y - CONFIG.BLOCK_HEIGHT,
      w,
      CONFIG.BLOCK_HEIGHT,
      randomKey
    );
    this.direction = 1;
  }

  // ===========================================
  //  ЛОГИКА ДВИЖЕНИЯ БЛОКА
  // ===========================================

  _updateMovingBlock(dt) {
    if (!this.movingBlock) return;
    const f = dt / 16.67;
    const speed = (CONFIG.BLOCK_SPEED + this.score * CONFIG.SPEED_INCREASE) * f;
    this.movingBlock.x += speed * this.direction;

    if (this.movingBlock.x + this.movingBlock.width > this.W) {
      this.movingBlock.x = this.W - this.movingBlock.width;
      this.direction = -1;
    }
    if (this.movingBlock.x < 0) {
      this.movingBlock.x = 0;
      this.direction = 1;
    }
  }

  // ===========================================
  //  ЛОГИКА ПАДЕНИЯ И ОБРЕЗКИ БЛОКА
  // ===========================================

  _dropBlock() {
    if (!this.movingBlock || this.state !== 'playing') return;

    const topBlock = this.blocks[this.blocks.length - 1];
    const mb = this.movingBlock;

    // Перекрытие по оси X
    const overlapLeft  = Math.max(mb.x, topBlock.x);
    const overlapRight = Math.min(mb.x + mb.width, topBlock.x + topBlock.width);
    const overlapWidth = overlapRight - overlapLeft;

    // Полный промах → Game Over
    if (overlapWidth <= 0) {
      this.state = 'gameover';
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this._saveBestScore(this.bestScore);
      }
      // Монеты за текущую сессию: 1 монета за каждые 5 блоков
      this.sessionCoinsEarned = Math.floor(this.score / 5);
      this.coins += this.sessionCoinsEarned;
      this._saveCoins(this.coins);
      this.movingBlock = null;
      this._updateOverlays();
      return;
    }

    // Обрезок
    const diff = topBlock.width - overlapWidth;
    const newBlock = this._createBlock(
      overlapLeft,
      topBlock.y - CONFIG.BLOCK_HEIGHT,
      overlapWidth,
      CONFIG.BLOCK_HEIGHT,
      mb.imageKey
    );
    this.blocks.push(newBlock);
    this.score++;
    this._updateScoreDisplay();

    // Эффект частиц
    if (diff > 0.5) {
      const isLeftCut = mb.x < topBlock.x;
      const cutX = isLeftCut ? mb.x : topBlock.x + topBlock.width;
      const particleColor = this._getBlockColor(mb.imageKey);
      this.particles.emit(cutX, newBlock.y, diff, CONFIG.BLOCK_HEIGHT, particleColor);
    }

    // Камера
    const neededY = this.H * CONFIG.SPAWN_Y_RATIO - newBlock.y;
    this.camera.setTarget(neededY);

    this.movingBlock = null;

    setTimeout(() => {
      if (this.state === 'playing') this._spawnMovingBlock();
    }, CONFIG.SPAWN_DELAY);
  }

  _getBlockColor(key) {
    const map = {
      black: '#222222', blue: '#4a90d9', green: '#27ae60',
      grey: '#aaaaaa', orange: '#f39c12', pink: '#e91e8f',
      purple: '#8e44ad', red: '#e74c3c', yellow: '#f1c40f',
      platform: '#888888',
    };
    return map[key] || '#cccccc';
  }

  // ===========================================
  //  ИГРОВОЙ ЦИКЛ
  // ===========================================

  _gameLoop(timestamp) {
    const dt = this.lastTime ? (timestamp - this.lastTime) : 16.67;
    this.lastTime = timestamp;

    if (this.state === 'playing') {
      this._updateMovingBlock(dt);
      this.camera.update(dt);
    }
    this.particles.update(dt);
    this._draw();

    requestAnimationFrame((t) => this._gameLoop(t));
  }

  // ===========================================
  //  ОТРИСОВКА
  // ===========================================

  _draw() {
    const ctx = this.ctx;

    // 1. Фон (blurred bg_menu during gameplay, bg_menu full during menu)
    this._drawBackground();

    // 2. Камера + блоки + частицы
    ctx.save();
    ctx.translate(0, this.camera.currentY);

    for (let i = 0; i < this.blocks.length; i++) {
      this._drawBlock(this.blocks[i]);
    }

    if (this.movingBlock && this.state === 'playing') {
      this._drawBlock(this.movingBlock);
    }

    this.particles.draw(ctx);

    ctx.restore();
  }

  /**
   * Рисует фон:
   *  -.Menu: bg_menu.png на весь экран
   *  - Playing: bg_menu.png с размытием + тёмная маска
   *  - Gameover: bg_menu.png с размытием + тёмная маска
   */
  _drawBackground() {
    const ctx = this.ctx;
    const bgMenu = this.assets.images.bg_menu;

    if (!bgMenu) {
      // Фоллбэк — простой градиент
      const g = ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#1a1a3e');
      g.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.W, this.H);
      return;
    }

    if (this.state === 'menu') {
      // В меню — рисуем фон чётко (HTML-оверлей сам поверх)
      ctx.drawImage(bgMenu, 0, 0, this.W, this.H);
      return;
    }

    // Игра / Game Over — размытый фон + маска
    // Создаём offscreen canvas с blur (один раз)
    if (!this._bgBlurReady) {
      this._bgBlurCanvas.width  = this.W;
      this._bgBlurCanvas.height = this.H;
      const bc = this._bgBlurCtx;
      bc.clearRect(0, 0, this.W, this.H);
      bc.filter = 'blur(12px)';
      bc.drawImage(bgMenu, 0, 0, this.W, this.H);
      bc.filter = 'none';
      this._bgBlurReady = true;
    }

    // Рисуем размытый фон
    ctx.drawImage(this._bgBlurCanvas, 0, 0);

    // Полупрозрачная тёмная маска для контраста блоков
    ctx.fillStyle = 'rgba(15, 15, 26, 0.35)';
    ctx.fillRect(0, 0, this.W, this.H);
  }

  /**
   * Рисует блок — чистый цветной прямоугольник, без PNG и обводок
   */
  _drawBlock(block) {
    const ctx = this.ctx;
    ctx.fillStyle = this._getBlockColor(block.imageKey);
    ctx.fillRect(block.x, block.y, block.width, block.height);
  }

  // ===========================================
  //  СОХРАНЕНИЕ РЕКОРДА
  // ===========================================

  _loadBestScore() {
    try {
      return parseInt(localStorage.getItem('stacker_best') || '0', 10);
    } catch { return 0; }
  }

  _saveBestScore(val) {
    try {
      localStorage.setItem('stacker_best', String(val));
    } catch { /* игнорируем */ }
  }

  // ===========================================
  //  СОХРАНЕНИЕ МОНЕТ
  // ===========================================

  _loadCoins() {
    try {
      return parseInt(localStorage.getItem('sp_coins') || '0', 10);
    } catch { return 0; }
  }

  _saveCoins(val) {
    try {
      localStorage.setItem('sp_coins', String(val));
    } catch { /* игнорируем */ }
  }
}

// =============================================
//  ТОЧКА ВХОДА — ЗАПУСК ИГРЫ
// =============================================
const game = new Game();
game.start();
