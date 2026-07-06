/* =============================================
   ИДЕАЛЬНАЯ СТОПКА — ИГРОВОЙ ДВИЖОК v0.1
   Telegram Mini App | Vanilla JS + Canvas
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
    // Собираем все файлы для загрузки: фон, платформа + все цветные блоки
    const files = [
      { key: 'bg',       src: 'assets/bg.png' },
      { key: 'platform', src: 'assets/platform.png' },
      ...BLOCK_IMAGE_NAMES.map(name => ({
        key: name,
        src: `assets/${name}.png`,
      })),
    ];

    this.total = files.length;

    // Загружаем параллельно, обновляя прогресс
    const promises = files.map(file => this._loadImage(file.key, file.src));
    await Promise.all(promises);
  }

  /**
   * Загружает одно изображение
   * @param {string} key  — ключ для доступа (this.images[key])
   * @param {string} src  — путь к файлу
   * @returns {Promise<void>}
   */
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
        // Если изображение не загрузилось — создаём заглушку (цветной прямоугольник)
        console.warn(`[AssetLoader] Не удалось загрузить: ${src}, создаю заглушку`);
        this.images[key] = this._createFallbackImage(key);
        this.loaded++;
        this._updateProgress();
        resolve();
      };
      img.src = src;
    });
  }

  /**
   * Создаёт заглушку — цветной canvas, если PNG не загрузился
   * @param {string} key
   * @returns {HTMLCanvasElement}
   */
  _createFallbackImage(key) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const cx = c.getContext('2d');
    // Цвет по умолчанию для каждого ключа
    const colors = {
      bg: '#a8edea',
      platform: '#999',
      black: '#222', blue: '#4a90d9', green: '#27ae60',
      grey: '#aaa', orange: '#f39c12', pink: '#e91e8f',
      purple: '#8e44ad', red: '#e74c3c', yellow: '#f1c40f',
    };
    cx.fillStyle = colors[key] || '#ccc';
    cx.fillRect(0, 0, 64, 64);
    return c;
  }

  /** Обновляет полосу прогресса на экране загрузки */
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
      // Полностью убираем из DOM через полсекунды
      setTimeout(() => { screen.style.display = 'none'; }, 600);
    }
  }
}

// =============================================
//  СИСТЕМА ЧАСТИЦ (Эффект обрезки блока)
// =============================================
class ParticleSystem {
  constructor() {
    /** @type {Array<Particle>} активные частицы */
    this.particles = [];
  }

  /**
   * Создаёт взрыв частиц из обрезанного куска блока
   * @param {number} x      — левая граница обрезка
   * @param {number} y      — верх обрезка
   * @param {number} width  — ширина обрезка
   * @param {number} height — высота обрезка
   * @param {string} color  — CSS-цвет блока
   */
  emit(x, y, width, height, color) {
    // Случайное количество частиц
    const count = CONFIG.PARTICLE_COUNT_MIN +
      Math.floor(Math.random() * (CONFIG.PARTICLE_COUNT_MAX - CONFIG.PARTICLE_COUNT_MIN + 1));

    for (let i = 0; i < count; i++) {
      // Случайная позиция внутри обрезанной области
      const px = x + Math.random() * width;
      const py = y + Math.random() * height;

      // Случайный размер
      const size = CONFIG.PARTICLE_SIZE_MIN +
        Math.random() * (CONFIG.PARTICLE_SIZE_MAX - CONFIG.PARTICLE_SIZE_MIN);

      // Случайная начальная скорость (разлет в стороны и вниз)
      const vx = (Math.random() - 0.5) * 3;   // горизонтально: -1.5 .. +1.5
      const vy = -Math.random() * 2 + 1;       // вертикально: в основном вниз

      this.particles.push({
        x: px,
        y: py,
        size: size,
        color: color,
        vx: vx,
        vy: vy,
        alpha: 1,       // прозрачность (затухает)
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  /**
   * Обновляет состояние всех частиц (вызывается каждый кадр)
   * @param {number} dt — время кадра в мс
   */
  update(dt) {
    const dtFactor = dt / 16.67; // нормализация под 60fps

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Гравитация
      p.vy += CONFIG.PARTICLE_GRAVITY * dtFactor;

      // Движение
      p.x += p.vx * dtFactor;
      p.y += p.vy * dtFactor;

      // Трение по воздуху
      p.vx *= CONFIG.PARTICLE_FRICTION;
      p.vy *= CONFIG.PARTICLE_FRICTION;

      // Вращение
      p.rotation += p.rotSpeed * dtFactor;

      // Затухание прозрачности
      p.alpha -= 0.015 * dtFactor;

      // Удаляем, если невидимы или ушли за экран
      if (p.alpha <= 0 || p.y > window.innerHeight + 50) {
        this.particles.splice(i, 1);
      }
    }
  }

  /**
   * Рисует все частицы на canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cameraY — смещение камеры
   */
  draw(ctx, cameraY) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x, p.y + cameraY);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  /** Очищает все частицы */
  clear() {
    this.particles = [];
  }
}

// =============================================
//  КАМЕРА (Плавное смещение по Y)
// =============================================
class Camera {
  constructor() {
    this.currentY    = 0;   // текущее смещение (анимированное)
    this.targetY     = 0;   // целевое смещение
  }

  /**
   * Устанавливает новую целевую позицию камеры
   * @param {number} newY — целевое Y-смещение
   */
  setTarget(newY) {
    if (newY > this.targetY) {
      this.targetY = newY;
    }
  }

  /**
   * Плавно двигает камеру к цели (вызывается каждый кадр)
   * @param {number} dt — время кадра в мс
   */
  update(dt) {
    const t = 1 - Math.pow(1 - CONFIG.CAM_LERP, dt / 16.67);
    this.currentY += (this.targetY - this.currentY) * t;
  }

  /** Сброс камеры в начальную позицию */
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

    // --- Загрузчик ассетов ---
    this.assets = new AssetLoader();

    // --- Системы ---
    this.particles = new ParticleSystem();
    this.camera    = new Camera();

    // --- Игровое состояние ---
    this.state      = 'loading';  // loading | menu | playing | gameover
    this.score      = 0;
    this.bestScore  = this._loadBestScore();

    // --- Блоки ---
    this.blocks      = [];   // стопка (от дна к верху)
    this.movingBlock = null; // текущий движущийся блок
    this.direction   = 1;    // 1 = вправо, -1 = влево

    // --- Время ---
    this.lastTime = 0;

    // --- Размер canvas ---
    this.W = 0;
    this.H = 0;
    this.dpr = 1;

    // Привязываем обработчики
    this._setupCanvas();
    this._setupInput();
  }

  // ===========================================
  //  ИНИЦИАЛИЗАЦИЯ
  // ===========================================

  /** Настраивает canvas под размер экрана */
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
    });
  }

  /** Привязывает обработчики ввода (тач/клик) */
  _setupInput() {
    const handler = (e) => {
      e.preventDefault();
      this._handleInput();
    };
    this.canvas.addEventListener('pointerdown', handler);

    // Предотвращаем зум и скролл
    document.addEventListener('gesturestart', e => e.preventDefault());
    document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  }

  /** Запускает загрузку ассетов, затем стартует игру */
  async start() {
    // Инициализация Telegram Web App
    this._initTelegram();

    // Загружаем все изображения
    await this.assets.loadAll();

    // Прячем экран загрузки
    this.assets.hideLoadingScreen();

    // Состояние — меню
    this.state = 'menu';

    // Запускаем игровой цикл
    requestAnimationFrame((t) => this._gameLoop(t));
  }

  /** Инициализация Telegram Web App */
  _initTelegram() {
    if (window.Telegram && Telegram.WebApp) {
      Telegram.WebApp.ready();
      Telegram.WebApp.expand();
    }
  }

  // ===========================================
  //  УПРАВЛЕНИЕ ИГРОВЫМ СОСТОЯНИЕМ
  // ===========================================

  /** Сброс и начало новой игры */
  _resetGame() {
    this.blocks      = [];
    this.movingBlock = null;
    this.camera.reset();
    this.particles.clear();
    this.score       = 0;
    this.state       = 'playing';

    // Создаём стартовую платформу (серый блок platform.png)
    const base = this._createBlock(
      (this.W - CONFIG.BASE_WIDTH) / 2,
      this.H - this.H * CONFIG.BASE_Y_OFFSET - CONFIG.BASE_HEIGHT,
      CONFIG.BASE_WIDTH,
      CONFIG.BASE_HEIGHT,
      'platform'    // ключ изображения
    );
    this.blocks.push(base);

    // Спавним первый движущийся блок
    this._spawnMovingBlock();
  }

  /**
   * Создаёт объект блока
   * @returns {Object}
   */
  _createBlock(x, y, width, height, imageKey) {
    return { x, y, width, height, imageKey };
  }

  /**
   * Спавнит новый движущийся блок над стопкой
   * Выбирает случайный цвет из доступных
   */
  _spawnMovingBlock() {
    const topBlock = this.blocks[this.blocks.length - 1];
    const w = topBlock.width;

    // Случайный цвет блока
    const randomKey = BLOCK_IMAGE_NAMES[
      Math.floor(Math.random() * BLOCK_IMAGE_NAMES.length)
    ];

    this.movingBlock = this._createBlock(
      this.W / 2 - w / 2,       // начинаем по центру
      topBlock.y - CONFIG.BLOCK_HEIGHT,
      w,
      CONFIG.BLOCK_HEIGHT,
      randomKey
    );
    this.direction = 1;
  }

  // ===========================================
  //  ОБРАБОТКА ВВОДА
  // ===========================================

  _handleInput() {
    switch (this.state) {
      case 'menu':
        this._resetGame();
        break;
      case 'playing':
        if (this.movingBlock) this._dropBlock();
        break;
      case 'gameover':
        this._resetGame();
        break;
    }
  }

  // ===========================================
  //  ЛОГИКА ДВИЖЕНИЯ БЛОКА
  // ===========================================

  /**
   * Обновляет позицию движущегося блока (влево-вправо)
   * @param {number} dt — время кадра в мс
   */
  _updateMovingBlock(dt) {
    if (!this.movingBlock) return;

    const dtFactor = dt / 16.67;
    const speed = (CONFIG.BLOCK_SPEED + this.score * CONFIG.SPEED_INCREASE) * dtFactor;

    this.movingBlock.x += speed * this.direction;

    // Отскок от краёв экрана
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

  /**
   * Блок падает вниз и вычисляется перекрытие с предыдущим блоком.
   * Обрезанный кусок дробится на частицы.
   */
  _dropBlock() {
    if (!this.movingBlock || this.state !== 'playing') return;

    const topBlock = this.blocks[this.blocks.length - 1];
    const mb = this.movingBlock;

    // Вычисляем перекрытие по оси X
    const overlapLeft  = Math.max(mb.x, topBlock.x);
    const overlapRight = Math.min(mb.x + mb.width, topBlock.x + topBlock.width);
    const overlapWidth = overlapRight - overlapLeft;

    // --- Полный промах → Game Over ---
    if (overlapWidth <= 0) {
      this.state = 'gameover';
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        this._saveBestScore(this.bestScore);
      }
      this.movingBlock = null;
      return;
    }

    // --- Вычисляем обрезок ---
    const diff = topBlock.width - overlapWidth;

    // Создаём новый блок = область перекрытия
    const newBlock = this._createBlock(
      overlapLeft,
      topBlock.y - CONFIG.BLOCK_HEIGHT,
      overlapWidth,
      CONFIG.BLOCK_HEIGHT,
      mb.imageKey
    );
    this.blocks.push(newBlock);
    this.score++;

    // --- Эффект частиц (обрезанный кусок) ---
    if (diff > 0.5) {
      // Определяем сторону обрезка
      const isLeftCut = mb.x < topBlock.x;
      const cutX = isLeftCut ? mb.x : topBlock.x + topBlock.width;

      // Получаем цвет из изображения блока для частиц
      const particleColor = this._getBlockColor(mb.imageKey);

      this.particles.emit(
        cutX,
        newBlock.y,
        diff,
        CONFIG.BLOCK_HEIGHT,
        particleColor
      );
    }

    // --- Сдвигаем камеру ---
    const neededY = this.H * CONFIG.SPAWN_Y_RATIO - newBlock.y;
    this.camera.setTarget(neededY);

    this.movingBlock = null;

    // Через задержку спавним следующий блок
    setTimeout(() => {
      if (this.state === 'playing') {
        this._spawnMovingBlock();
      }
    }, CONFIG.SPAWN_DELAY);
  }

  /**
   * Возвращает CSS-цвет по ключу изображения (для частиц)
   * @param {string} key
   * @returns {string}
   */
  _getBlockColor(key) {
    const map = {
      black:   '#222222',
      blue:    '#4a90d9',
      green:   '#27ae60',
      grey:    '#aaaaaa',
      orange:  '#f39c12',
      pink:    '#e91e8f',
      purple:  '#8e44ad',
      red:     '#e74c3c',
      yellow:  '#f1c40f',
      platform:'#999999',
    };
    return map[key] || '#cccccc';
  }

  // ===========================================
  //  ИГРОВОЙ ЦИКЛ
  // ===========================================

  _gameLoop(timestamp) {
    const dt = this.lastTime ? (timestamp - this.lastTime) : 16.67;
    this.lastTime = timestamp;

    // Обновление логики
    if (this.state === 'playing') {
      this._updateMovingBlock(dt);
      this.camera.update(dt);
    }
    this.particles.update(dt);

    // Отрисовка
    this._draw();

    requestAnimationFrame((t) => this._gameLoop(t));
  }

  // ===========================================
  //  ОТРИСОВКА
  // ===========================================

  _draw() {
    const ctx = this.ctx;

    // --- 1. Фон (bg.png) ---
    this._drawBackground();

    // --- 2. Смещение камеры ---
    ctx.save();
    ctx.translate(0, this.camera.currentY);

    // --- 3. Блоки стопки ---
    for (let i = 0; i < this.blocks.length; i++) {
      this._drawBlock(this.blocks[i]);
    }

    // --- 4. Движущийся блок ---
    if (this.movingBlock && this.state === 'playing') {
      this._drawBlock(this.movingBlock);
    }

    // --- 5. Частицы обрезка ---
    this.particles.draw(ctx, 0); // cameraY уже применён через ctx.translate

    ctx.restore();

    // --- 6. Счёт (поверх камеры) ---
    this._drawScore();

    // --- 7. Оверлеи ---
    if (this.state === 'menu')     this._drawMenu();
    if (this.state === 'gameover') this._drawGameOver();
  }

  /** Рисует фон (растягивает bg.png на весь экран) */
  _drawBackground() {
    const bg = this.assets.images.bg;
    if (bg) {
      this.ctx.drawImage(bg, 0, 0, this.W, this.H);
    } else {
      // Фоллбэк — градиент
      const g = this.ctx.createLinearGradient(0, 0, 0, this.H);
      g.addColorStop(0, '#a8edea');
      g.addColorStop(1, '#fed6e3');
      this.ctx.fillStyle = g;
      this.ctx.fillRect(0, 0, this.W, this.H);
    }
  }

  /**
   * Рисует блок (платформу или цветной блок)
   * Масштабирует изображение под размер блока
   * @param {Object} block
   */
  _drawBlock(block) {
    const ctx = this.ctx;
    const img = this.assets.images[block.imageKey];

    // Тень (лёгкая)
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(block.x + 2, block.y + 2, block.width, block.height);

    if (img) {
      // Растягиваем изображение под размер блока
      ctx.drawImage(img, block.x, block.y, block.width, block.height);
    } else {
      // Фоллбэк — заливка цветом
      ctx.fillStyle = this._getBlockColor(block.imageKey);
      ctx.fillRect(block.x, block.y, block.width, block.height);
    }

    // Тонкий блик сверху для объёма
    const grad = ctx.createLinearGradient(block.x, block.y, block.x, block.y + block.height);
    grad.addColorStop(0,   'rgba(255,255,255,0.22)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
    grad.addColorStop(1,   'rgba(0,0,0,0.10)');
    ctx.fillStyle = grad;
    ctx.fillRect(block.x, block.y, block.width, block.height);
  }

  /** Отрисовка счёта в верхней части экрана */
  _drawScore() {
    const ctx = this.ctx;
    ctx.save();

    // Плашка
    const pillW = 110, pillH = 42;
    const pillX = this.W / 2 - pillW / 2;
    const pillY = 50;

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    this._roundRect(ctx, pillX, pillY, pillW, pillH, 21);
    ctx.fill();

    // Текст
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(this.score), this.W / 2, pillY + pillH / 2);

    ctx.restore();
  }

  /** Экран меню (начальный экран) */
  _drawMenu() {
    const ctx = this.ctx;

    // Полупрозрачный оверлей
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // Заголовок
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 36px "Segoe UI", sans-serif';
    ctx.fillText('Идеальная стопка', this.W / 2, this.H * 0.30);

    // Подзаголовок
    ctx.font = '16px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('Нажми, чтобы начать', this.W / 2, this.H * 0.38);

    // Кнопка
    this._drawButton(this.W / 2, this.H * 0.52, 'ИГРАТЬ', '#4ecdc4');
  }

  /** Экран Game Over */
  _drawGameOver() {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    // ИГРА ОКОНЧЕНА
    ctx.fillStyle = '#ff6b6b';
    ctx.font = 'bold 40px "Segoe UI", sans-serif';
    ctx.fillText('ИГРА ОКОНЧЕНА', this.W / 2, this.H * 0.28);

    // Счёт
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px "Segoe UI", sans-serif';
    ctx.fillText(`Счёт: ${this.score}`, this.W / 2, this.H * 0.38);

    // Рекорд
    ctx.font = '18px "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(`Рекорд: ${this.bestScore}`, this.W / 2, this.H * 0.45);

    // Кнопка
    this._drawButton(this.W / 2, this.H * 0.57, 'ЗАНОВО', '#4ecdc4');
  }

  /**
   * Рисует кнопку с закруглениями
   * @param {number} cx — центр X
   * @param {number} cy — центр Y
   * @param {string} text — текст кнопки
   * @param {string} color — цвет кнопки
   */
  _drawButton(cx, cy, text, color) {
    const ctx = this.ctx;
    const bw = 200, bh = 54;
    const bx = cx - bw / 2;
    const by = cy - bh / 2;

    // Тень
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    this._roundRect(ctx, bx + 2, by + 3, bw, bh, 14);
    ctx.fill();

    // Кнопка
    ctx.fillStyle = color;
    this._roundRect(ctx, bx, by, bw, bh, 14);
    ctx.fill();

    // Текст
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px "Segoe UI", sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy);
  }

  /**
   * Рисует закруглённый прямоугольник (path)
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
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
}

// =============================================
//  ТОЧКА ВХОДА — ЗАПУСК ИГРЫ
// =============================================
const game = new Game();
game.start();
