/*  Aidan & Dune’s Adventure  – side-scroller build
    -------------------------------------------------
    Features
      • each map loads its own tile graphics (platform, lava, coin, background)
      • only one audio track plays at a time (all stop on scene change)
      • losebounce.wav plays once on Game Over
      • win.wav plays once on Win
      • ESC key returns to the Start screen
      • robust platform collision (no tunnelling, 1-tile crawl)
      • 20% stronger jump
      • walk animation plays even when pushing a wall
      • DVD logos spawn safely & bounce with sound
      • X-key (or ⚽️ button) launches gravity-bouncing balls (ball.png)
      • Touch overlay & tap-to-start for mobile
*/

/* ─── Global constants ─── */
const GAME_TIME_LIMIT = 120000;
const GRAVITY = 0.8;
const MOVE_SPEED = 4;
const JUMP_STRENGTH = 20;
const TERMINAL_VEL = 25;
const logoScale = 0.125;
const MAX_BALLS = 100;
const BOUNCE_COOLDOWN = 3000;

/* ─── Mobile helpers ─── */
const IS_TOUCH = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const touchKeys = { left: false, right: false, jump: false, kick: false };

/* ─── Level registry ─── */
const MAPS = {
  MAP1: {
    mapImg: 'assets/map1.png',
    music: 'assets/level1.wav',
    tiles: {
      platform: 'assets/platform.png',
      lava:     'assets/lava.png',
      coin:     'assets/coin.png',
      background: 'assets/startupBackground.png'
    }
  },
  MAP2: {
    mapImg: 'assets/map2.png',
    music: 'assets/level2.wav',
    tiles: {
      platform: 'assets/platform2.png',
      lava:     'assets/lava2.png',
      coin:     'assets/coin2.png',
      background: 'assets/sky2.png'
    }
  },
  MAP3: {
    mapImg: 'assets/map3.png',
    music: 'assets/level3.wav',
    tiles: {
      platform: 'assets/platform3.png',
      lava:     'assets/lava3.png',
      coin:     'assets/coin3.png',
      background: 'assets/sky3.png'
    }
  }
};

/* ─── Assets & globals ─── */
let img = {};    // all loaded images
let sfx = {};    // sfx.jump, sfx.coin, sfx.bonk, sfx.kick, sfx.bounce, sfx.losebounce, sfx.win
let music;       // menu/startup music (audioLoop.wav)
let mapImg;      // current map image (bitmap)
let tileSize, mapW, mapH;
let tiles = [], coins = [], flagPos = null, playerStart;
let totalCoins = 0;
let sceneManager;

/* ══════════ preload ══════════ */
function preload() {
  // 1) Core UI / sprite sheets / logos
  [
    'startupBackground', 'selectionBackground',
    'aidanLogo', 'duneLogo',
    'platform', 'lava', 'flag', 'coin', 'ball',
    'lose', 'winbackground',
    'dune_idle', 'dune_walk', 'dune_jump',
    'aidan_idle', 'aidan_walk', 'aidan_jump'
  ].forEach(name => {
    img[name] = loadImage(`assets/${name}.png`);
  });

  // 2) Map‐specific assets: map bitmap + level music + tile textures
  for (const spec of Object.values(MAPS)) {
    spec.img = loadImage(spec.mapImg);       // load map bitmap
    spec.musicObj = loadSound(spec.music);    // load level music

    // load each tile image into img[path]
    for (const path of Object.values(spec.tiles)) {
      if (!img[path]) {
        img[path] = loadImage(path);
      }
    }
  }

  // 3) Menu / startup looping audio
  music = loadSound('assets/audioLoop.wav');

  // 4) SFX
  sfx.jump         = loadSound('assets/jump.wav');
  sfx.coin         = loadSound('assets/coin.wav');
  sfx.bonk         = loadSound('assets/collide.wav');
  sfx.kick         = loadSound('assets/kick.wav');
  sfx.bounce       = loadSound('assets/bounce.wav');
  sfx.losebounce   = loadSound('assets/losebounce.wav');
  sfx.win          = loadSound('assets/win.wav');
}

/* ══════════ setup ══════════ */
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(window.devicePixelRatio || 1);
  noSmooth();
  textAlign(CENTER, CENTER);

  sceneManager = new SceneManager();
  sceneManager.change('start');

  // loop & quiet menu music initially
  if (music) {
    music.setLoop(true);
    music.setVolume(0.6);
  }
}

function draw()               { sceneManager.updateAndDraw(); }
function keyPressed()         { sceneManager.keyPressed?.(keyCode); }
function mousePressed()       { sceneManager.mousePressed?.(); }
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (mapImg) parseMap();
  sceneManager.onResize?.();
}

/* ══════════ Stop All Music Helper ══════════ */
function stopAllMusic() {
  // stop menu music
  if (music && music.isPlaying?.()) {
    music.stop();
  }
  // stop each level's musicObj if playing
  for (const lvlKey in MAPS) {
    const mus = MAPS[lvlKey].musicObj;
    if (mus && mus.isPlaying?.()) {
      mus.stop();
    }
  }
}

/* ══════════ Scene Manager ══════════ */
class SceneManager {
  constructor() {
    this.scenes = {
      start:  new Start(this),
      select: new Select(this),
      level:  new LevelSelect(this),
      play:   new Play(this),
      over:   new Over(this),
      win:    new Win(this)
    };
    this.current = null;
  }
  change(name, data) {
    stopAllMusic();            // ensure no overlap
    this.current?.exit?.();
    this.current = this.scenes[name];
    this.current.enter?.(data);
  }
  updateAndDraw() {
    this.current?.update?.();
    this.current?.draw?.();
  }
  keyPressed(k) {
    if (k === 27) {            // ESC → back to Start
      this.change('start');
      return;
    }
    this.current?.keyPressed?.(k);
  }
  mousePressed()  { this.current?.mousePressed?.(); }
  onResize()      { this.current?.onResize?.(); }
}

/* ══════════ Utility Classes ══════════ */
class Logo {
  constructor(img) {
    this.img = img;
    this.w = img.width * logoScale;
 this.h = img.height * logoScale;
    const margin = 10;
    let ok = false;
    while (!ok) {
      this.pos = createVector(
        random(margin, width - margin - this.w),
        random(margin, height - margin - this.h)
      );
      ok = (
        this.pos.x > margin &&
        this.pos.y > margin &&
        this.pos.x + this.w < width - margin &&
        this.pos.y + this.h < height - margin
      );
    }
    this.vel = p5.Vector.random2D().setMag(3);
  }
  update() {
    this.pos.add(this.vel);
    let bounced = false;
    if (this.pos.x < 0 || this.pos.x + this.w > width) {
      this.vel.x *= -1;
      bounced = true;
    }
    if (this.pos.y < 0 || this.pos.y + this.h > height) {
      this.vel.y *= -1;
      bounced = true;
    }
    if (bounced) sfx.bonk?.play();
  }
  draw() {
    image(this.img, this.pos.x, this.pos.y, this.w, this.h);
  }
  collides(o) {
    return !(
      o.pos.x >= this.pos.x + this.w ||
      o.pos.x + o.w <= this.pos.x ||
      o.pos.y >= this.pos.y + this.h ||
      o.pos.y + o.h <= this.pos.y
    );
  }
  bounce(o) {
    [this.vel, o.vel] = [o.vel.copy(), this.vel.copy()];
    sfx.bonk?.play();
  }
}

class Sprite {
  constructor(sheet, frames, scale) {
    this.sheet = sheet;
    this.frames = frames;
    this.scale = scale;
    this.f = 0;
  }
  draw(x, y, flip, speed) {
    if (!this.sheet) return;
    this.f = (this.f + speed) % this.frames;
    const sz = this.sheet.height;
    push();
    if (flip) {
      translate(x + sz * this.scale, y);
      scale(-1, 1);
    } else {
      translate(x, y);
    }
    image(
      this.sheet,
      0, 0, sz * this.scale, sz * this.scale,
      floor(this.f) * sz, 0, sz, sz
    );
    pop();
  }
}

/* ══════════ Ball ══════════ */
class Ball {
  constructor(x, y, dirRight) {
    this.pos = createVector(x, y);
    const ang = dirRight ? -PI / 4 : -3 * PI / 4; // 45°
    this.vel = p5.Vector.fromAngle(ang).setMag(8);
    this.r = tileSize * 0.4;
    this.spin = random(-0.2, 0.2);
    this.a = 0;
    this.birth = millis();
    this.lastSound = 0;
  }
  update() {
    this.vel.y += GRAVITY * 0.5;
    const next = p5.Vector.add(this.pos, this.vel);

    // horizontal walls
    if (next.x - this.r < 0 || next.x + this.r > mapW * tileSize) {
      this.vel.x *= -1;
      if (millis() - this.lastSound > BOUNCE_COOLDOWN) {
        this.lastSound = millis();
        sfx.bounce?.play();
      }
    }

    // platform bounce
    const tx = floor(next.x / tileSize);
    const vy = this.vel.y > 0 ? next.y + this.r : next.y - this.r;
    const ty = floor(vy / tileSize);
    if (tiles[ty]?.[tx] === 'platform') {
      this.vel.y *= -0.85;
      if (millis() - this.lastSound > BOUNCE_COOLDOWN) {
        this.lastSound = millis();
        sfx.bounce?.play();
      }
    }

    this.pos.add(this.vel);
    this.a += this.spin;
  }
  draw() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.a);
    image(img.ball, -this.r, -this.r, this.r * 2, this.r * 2);
    pop();
  }
}

/* ══════════ Player ══════════ */
class Player {
  constructor(x, y, sheets) {
    this.pos = createVector(x, y);
    this.vel = createVector(0, 0);
    this.w = tileSize * 0.8;
    this.h = tileSize * 0.9;
    this.g = false;
    this.flip = false;
    this.walkIntent = false;
    this.spriteScale = 1.3; // Increase this value to make sprites bigger

    this.idle = new Sprite(sheets.idle, 2, (this.w / 64) * this.spriteScale);
    this.walk = new Sprite(sheets.walk, 8, (this.w / 64) * this.spriteScale); // Apply spriteScale to walk animation
    this.jump = new Sprite(sheets.jump, 1, (this.w / 64) * this.spriteScale); // Apply spriteScale to jump animation
  }
  update() {
    let dir = 0;
    if (keyIsDown(65)  || keyIsDown(LEFT_ARROW)  || touchKeys.left)  dir = -1;
    if (keyIsDown(68)  || keyIsDown(RIGHT_ARROW) || touchKeys.right) dir = 1;
    const wantJump = keyIsDown(32) || keyIsDown(UP_ARROW) || touchKeys.jump;
    const wantKick = keyIsDown(88) || touchKeys.kick;

    this.walkIntent = dir !== 0;
    this.vel.x = lerp(this.vel.x, dir * MOVE_SPEED, 0.2);
    if (dir !== 0) this.flip = dir < 0;

    if (wantJump && this.g) {
      this.vel.y = -JUMP_STRENGTH;
      this.g = false;
      sfx.jump?.play();
    }

    if (wantKick) {
      touchKeys.kick = false;
      if (this.scene.balls.length < MAX_BALLS) {
        const bx = this.pos.x + this.w / 2;
        const by = this.pos.y + this.h / 2;
        this.scene.balls.push(new Ball(bx, by, !this.flip));
        sfx.kick?.play();
      }
    }

    this.vel.y += GRAVITY;
    this.vel.y = constrain(this.vel.y, -TERMINAL_VEL, TERMINAL_VEL);

    this.pos.x += this.vel.x;
    this.resolveX();

    this.pos.y += this.vel.y;
    this.resolveY();
  }

  resolveX() {
    const top    = floor((this.pos.y + this.h * 0.25) / tileSize);
    const bottom = floor((this.pos.y + this.h * 0.75) / tileSize);
    const leftT  = floor(this.pos.x / tileSize);
    const rightT = floor((this.pos.x + this.w) / tileSize);

    for (let ty = top; ty <= bottom; ty++) {
      if (this.vel.x > 0 && tiles[ty]?.[rightT] === 'platform') {
        this.pos.x = rightT * tileSize - this.w - 0.01;
        this.vel.x = 0;
      }
      if (this.vel.x < 0 && tiles[ty]?.[leftT] === 'platform') {
        this.pos.x = (leftT + 1) * tileSize + 0.01;
        this.vel.x = 0;
      }
    }
  }

  resolveY() {
    if (this.vel.y > 0) {
      const yTile = floor((this.pos.y + this.h) / tileSize);
      const left  = floor(this.pos.x / tileSize);
      const right = floor((this.pos.x + this.w - 1) / tileSize);
      for (let tx = left; tx <= right; tx++) {
        if (tiles[yTile]?.[tx] === 'platform') {
          this.pos.y = yTile * tileSize - this.h - 0.01;
          this.vel.y = 0;
          this.g = true;
          break;
        }
      }
    } else if (this.vel.y < 0) {
      const yTile = floor(this.pos.y / tileSize);
      const left  = floor(this.pos.x / tileSize);
      const right = floor((this.pos.x + this.w - 1) / tileSize);
      for (let tx = left; tx <= right; tx++) {
        if (tiles[yTile]?.[tx] === 'platform') {
          this.pos.y = (yTile + 1) * tileSize + 0.01;
          this.vel.y = 0;
          break;
        }
      }
    }
  }

  draw() {
    // Calculate sprite offset to keep the collision box in the same place
    const spriteOffset = (this.w * (this.spriteScale - 1)) / 2;

    if (!this.g) {
 this.jump.draw(this.pos.x - spriteOffset, this.pos.y + 5 - spriteOffset, this.flip, 0);
    } else if (this.walkIntent) {
 this.walk.draw(this.pos.x - spriteOffset, this.pos.y + 5 - spriteOffset, this.flip, 0.3);
    } else {
 this.idle.draw(this.pos.x - spriteOffset, this.pos.y + 5 - spriteOffset, this.flip, 0.1);
    }

    // Optional: Draw the collision box for debugging
    // noFill();
    // stroke(255, 0, 0);
    // rect(this.pos.x, this.pos.y, this.w, this.h);
  }
}

/* ══════════ Scenes ══════════ */
class Start {
  constructor(sm) {
    this.sm = sm;
  }
  enter() {
    this.logos = [
      new Logo(img.aidanLogo),
      new Logo(img.duneLogo)
    ];
  }
  update() {
    this.logos.forEach(l => l.update());
    if (this.logos[0].collides(this.logos[1])) {
      this.logos[0].bounce(this.logos[1]);
    }
  }
  draw() {
    image(img.startupBackground, 0, 0, width, height);

    let hueVal = frameCount % 360;
    colorMode(HSB);
    let strokeColor = color((hueVal + 350) % 360, 100, 100);
    let titleColor  = color(hueVal, 100, 100);

    textAlign(CENTER);
    stroke(strokeColor);
    strokeWeight(1);
    fill(titleColor);
    textSize(50);

    let yOffset1 = sin(frameCount * 0.1) * 6;
    let yOffset2 = cos(frameCount * 0.1) * -6;
    let xOffset1 = sin(frameCount * 0.1) * 6;
    let xOffset2 = cos(frameCount * 0.1) * -6;

    text("Aidan & Dune's", xOffset1 + width / 2, height * 0.1 + yOffset1);
    text("Berry Adventure", xOffset2 + width / 2, height * 0.18 + yOffset2);

    strokeWeight(6);
    stroke(100);
    fill(0);
    textSize(24);
    text("Turn off Silent mode for sound 🎧", width / 2, height * 0.38);
    text("Goal: Collect berries before the timer runs out", width / 2, height * 0.42);
    text("R = Restart Level", width / 2, height * 0.48);
    text("X = Launch Ball", width / 2, height * 0.52);
    text("Arrow Keys = Move/Jump", width / 2, height * 0.56);

    colorMode(RGB);
    noStroke();
    this.logos.forEach(l => l.draw());
  }
  keyPressed() {
    getAudioContext().resume();
    if (music && !music.isPlaying()) music.play();
    this.sm.change('select');
  }
  mousePressed() {
    this.keyPressed();
  }
}

class Select {
  constructor(sm) {
    this.sm = sm;
  }
  enter() {
    this.aBox = {
      w: img.aidanLogo.width * logoScale * 0.6, // Use smaller width
      h: img.aidanLogo.height * logoScale * 0.6 // Use smaller height
    };
    this.aBox.x = width * 0.25 - this.aBox.w / 2; // Center horizontally
    this.aBox.y = height * 0.45 - this.aBox.h / 2; // Center vertically

    this.dBox = {
      w: this.aBox.w, // Same width as aidanLogo
      h: this.aBox.h  // Same height as aidanLogo
    };
    this.dBox.x = width * 0.75 - this.dBox.w / 2; // Center horizontally
    this.dBox.y = this.aBox.y; // Align vertically with aidanLogo
    this.hover = null;
  }
  update() {
    const inBox = b =>
      mouseX > b.x && mouseX < b.x + b.w &&
      mouseY > b.y && mouseY < b.y + b.h;
    this.hover = inBox(this.aBox) ? 'aidan'
               : inBox(this.dBox) ? 'dune'
               : null;
    cursor(this.hover ? 'pointer' : 'default');
  }
  draw() {
    image(img.selectionBackground, 0, 0, width, height);
    fill(255);
    textSize(32);
    text("Choose your character", width / 2, height * 0.25);
    image(img.aidanLogo, this.aBox.x, this.aBox.y, this.aBox.w, this.aBox.h);
    image(img.duneLogo, this.dBox.x, this.dBox.y, this.dBox.w, this.dBox.h);
  }
  mousePressed() {
    if (this.hover) {
      this.sm.change('level', { char: this.hover });
    }
  }
}

class LevelSelect {
  constructor(sm) {
    this.sm = sm;
    this.buttons = [];
    this.hover = null;
  }
  enter(data) {
    this.char  = data.char;

    // Create a container for the level buttons
    this.levelButtonsContainer = createDiv('');
    this.levelButtonsContainer.style('display', 'flex');
    this.levelButtonsContainer.style('justify-content', 'center');
    this.levelButtonsContainer.style('align-items', 'center');
    this.levelButtonsContainer.style('width', '100%');
    this.levelButtonsContainer.style('position', 'absolute');
    this.levelButtonsContainer.style('top', '50%');
    this.levelButtonsContainer.style('transform', 'translateY(-50%)');
    this.levelButtonsContainer.style('gap', '20px'); // Add some spacing between buttons
 this.levelButtonsContainer.id('level-select-container'); // Add an ID for easy removal

    const keys = Object.keys(MAPS);
    this.buttons = keys.map(key => {
      const spec = MAPS[key];
      const buttonDiv = createDiv('');
      buttonDiv.parent(this.levelButtonsContainer);
      buttonDiv.style('text-align', 'center');
      buttonDiv.style('cursor', 'pointer');
      buttonDiv.style('padding', '10px');
      buttonDiv.style('border-radius', '10px');
      buttonDiv.style('background', 'rgba(0, 0, 0, 0.5)');
      buttonDiv.style('color', '#fff');
      buttonDiv.style('font-size', '20px');
      buttonDiv.style('border', '2px solid transparent');
      buttonDiv.mouseOver(() => this.hover = key);
      buttonDiv.mouseOut(() => this.hover = null);
      buttonDiv.mousePressed(() => this.sm.change('play', { char: this.char, level: key }));

      const imgElement = createImg(spec.mapImg, key);
      imgElement.style('width', '60px'); // Make images even smaller
      imgElement.style('height', '60px'); // Keep aspect ratio square-ish
      imgElement.parent(buttonDiv);

      createP(key).parent(buttonDiv);
      return { key: key, element: buttonDiv };
    });

    this.tPlatform   = img[spec.tiles.platform];
    this.tLava = img[spec.tiles.lava];
    this.tCoin       = img[spec.tiles.coin];
    this.tBackground = img[spec.tiles.background];
  }
  update() {
    // Update button styles based on hover
    this.buttons.forEach(button => {
      if (this.hover === button.key) {
        button.element.style('border', '2px solid #ff66cc');
      } else {
        button.element.style('border', '2px solid transparent');
      }
    });
  }

  exit() {
    // Remove the level selection container when exiting the scene
    const container = document.getElementById('level-select-container');
    if (container) container.remove();
  }
  draw() {
    image(img.selectionBackground, 0, 0, width, height);
    fill(255);
    textSize(34);
    text('Select Level', width / 2, height * 0.35);
    // The buttons are now DOM elements, they draw themselves
  }
  mousePressed() {
    if (this.hover) {
      this.sm.change('play', { char: this.char, level: this.hover.key });
    }
  }
}

class Play {
  constructor(sm) {
    this.sm = sm;
  }
  enter(data) {
    this.char  = data.char;
    this.level = data.level || 'MAP1';
    const spec = MAPS[this.level];

    parseMapFrom(spec.img);

    const sheets = {
      idle: img[this.char + '_idle'],
      walk: img[this.char + '_walk'],
      jump: img[this.char + '_jump']
    };
    this.p = new Player(playerStart.x * tileSize, playerStart.y * tileSize, sheets);
    this.p.scene = this;

    if (IS_TOUCH) makeTouchUI(this.sm);
    this.cam = 0;
    this.t0 = millis();
    this.coins = coins.map(c => ({ ...c, col: false }));
    this.balls = [];

    // stop any playing level music
    for (const lvlKey in MAPS) {
      const old = MAPS[lvlKey].musicObj;
      if (old && old.isPlaying?.()) old.stop();
    }
    this.music = spec.musicObj || null;
    if (this.music && typeof this.music.isPlaying === 'function' && !this.music.isPlaying()) {
      this.music.setLoop(true);
      this.music.setVolume(0.6);
      this.music.play();
    }

    this.tPlatform   = img[spec.tiles.platform];
    this.tLava       = img[spec.tiles.lava];
    this.tCoin       = img[spec.tiles.coin];
    this.tBackground = img[spec.tiles.background];
  }
  update() {
    const timeLeft = GAME_TIME_LIMIT - (millis() - this.t0);
    if (timeLeft <= 0) {
      this.sm.change('over', {
        c: this.collected(),
        char: this.char,
        level: this.level
      });
      return;
    }

    this.p.update();
    this.cam = constrain(
      this.p.pos.x + this.p.w / 2 - width / 2,
      0,
      mapW * tileSize - width
    );

    // coin collection
    for (const c of this.coins) {
      if (!c.col && dist(this.p.pos.x, this.p.pos.y, c.x, c.y) < tileSize * 0.8) {
        c.col = true;
        sfx.coin?.play();
      }
    }

    // update balls & collisions
    for (const b of this.balls) b.update();
    this.handleBallCollisions();

    // lose conditions
    if (this.p.pos.y > mapH * tileSize || this.touchLava()) {
      this.sm.change('over', {
        c: this.collected(),
        char: this.char,
        level: this.level
      });
    }

    // win condition
    if (
      dist(
        this.p.pos.x,
        this.p.pos.y,
        flagPos.x * tileSize,
        flagPos.y * tileSize
      ) < tileSize
    ) {
      this.sm.change('win', {
        c: this.collected(),
        char: this.char,
        level: this.level
      });
    }
  }

  touchLava() {
    const l = floor(this.p.pos.x / tileSize);
    const r = floor((this.p.pos.x + this.p.w) / tileSize);
    const t = floor(this.p.pos.y / tileSize);
    const b = floor((this.p.pos.y + this.p.h) / tileSize);
    for (let y = t; y <= b; y++) {
      for (let x = l; x <= r; x++) {
        if (tiles[y]?.[x] === 'lava') return true;
      }
    }
    return false;
  }

  handleBallCollisions() {
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) {
        const a = this.balls[i], b = this.balls[j];
        const d = p5.Vector.dist(a.pos, b.pos);
        if (d < a.r + b.r && d > 0) {
          const n = p5.Vector.sub(b.pos, a.pos).setMag(1);
          const overlap = a.r + b.r - d;
          a.pos.add(p5.Vector.mult(n, -overlap / 2));
          b.pos.add(p5.Vector.mult(n, overlap / 2));
          const rel = p5.Vector.sub(a.vel, b.vel).dot(n);
          if (rel > 0) {
            const impulse = rel * 0.9;
            a.vel.sub(p5.Vector.mult(n, impulse));
            b.vel.add(p5.Vector.mult(n, impulse));
            const now = millis();
            if (now - a.lastSound > BOUNCE_COOLDOWN) {
              a.lastSound = b.lastSound = now;
              sfx.bounce?.play();
            }
          }
        }
      }
    }
  }

  draw() {
    if (this.tBackground) {
      image(this.tBackground, -this.cam, 0, mapW * tileSize, height);
    } else {
      background(100);
    }

    push();
    translate(-this.cam, 0);

    // draw tiles
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const t = tiles[y][x];
        if (t === 'platform' && this.tPlatform) {
          image(this.tPlatform, x * tileSize, y * tileSize, tileSize, tileSize);
        } else if (t === 'lava' && this.tLava) {
          image(this.tLava, x * tileSize, y * tileSize, tileSize, tileSize);
        }
      }
    }

    // draw balls
    this.balls.forEach(b => b.draw());
    this.balls = this.balls.filter(b => millis() - b.birth < 20000);

    // draw coins
    this.coins.forEach(c => {
      if (!c.col && this.tCoin) {
        image(this.tCoin, c.x, c.y, tileSize, tileSize);
      }
    });

    // draw flag
    if (flagPos) {
      image(
        img.flag,
        flagPos.x * tileSize,
        flagPos.y * tileSize - tileSize,
        tileSize,
        tileSize * 1.5
      );
    }

    // draw player
    this.p.draw();

    pop();

    // HUD
    image(
      img[this.char + 'Logo'],
      10,
      10,
      img[this.char + 'Logo'].width * logoScale,
      img[this.char + 'Logo'].height * logoScale
    );
    fill(255);
    textSize(24);
    text(`Coins: ${this.collected()}/${totalCoins}`, width - 108, 30);
    text(Math.ceil((GAME_TIME_LIMIT - (millis() - this.t0)) / 1000), width / 2, 30);
  }

  collected() {
    return this.coins.filter(c => c.col).length;
  }

  keyPressed(k) {
    if (k === 82) { // R
      this.sm.change('play', {
        char: this.char,
        level: this.level
      });
    }
    if (k === 88) { // X
      if (this.balls.length < MAX_BALLS) {
        const bx = this.p.pos.x + this.p.w / 2;
        const by = this.p.pos.y + this.p.h / 2;
        this.balls.push(new Ball(bx, by, !this.p.flip));
        sfx.kick?.play();
      }
    }
  }
}

class Over {
  constructor(sm) {
    this.sm = sm;
  }
  enter(d) {
    this.c     = d.c;
    this.char  = d.char;
    this.level = d.level;
    // stop all audio on scene change is already handled by SceneManager.change
    sfx.losebounce?.play();
  }
  draw() {
    background(0);
    stroke(0); // Black stroke
    strokeWeight(2); // Make stroke a little thinner
    fill(0);

    image(img.lose, 0, 0, width, height);
    fill(255, 0, 0);
    textSize(48);
    text("GAME OVER", width / 2, height * 0.4);
    fill(255);
    textSize(24);
    text(`Coins: ${this.c}/${totalCoins}`, width / 2, height * 0.5);
    text("Press R to retry", width / 2, height * 0.56);
    text("ESC = Main Menu", width / 2, height * 0.62);
  }
  keyPressed(k) {
    if (k === 82) { // R
      this.sm.change('play', {
        char: this.char,
        level: this.level
      });
    }
    // ESC handled by SceneManager.keyPressed
  }
}

class Win {
  constructor(sm) {
    this.sm = sm;
  }
  enter(d) {
    this.c     = d.c;
    this.char  = d.char;
    this.level = d.level;
    sfx.win?.play();
  }
  draw() {
    background(135, 206, 250);
    image(img.winbackground, 0, 0, width, height);
    stroke(255); // White stroke
    strokeWeight(3);
    fill(0);
    textSize(48);
    text("YOU WIN!", width / 2, height * 0.4);
    textSize(24);
    text(`Coins: ${this.c}/${totalCoins}`, width / 2, height * 0.5);
    text("Press R to replay", width / 2, height * 0.56); // This line was duplicated, keeping only one
    text("ESC = Main Menu", width / 2, height * 0.62);
  }
  keyPressed(k) {
    if (k === 82) { // R
      this.sm.change('play', {
        char: this.char,
        level: this.level
      });
    }
    // ESC handled by SceneManager.keyPressed
  }
}

/* ══════════ Map Parse ══════════ */
function parseMap() {
  if (!mapImg) return;
  mapW = mapImg.width;
  mapH = mapImg.height;
  tileSize = height / mapH;

  mapImg.loadPixels();
  tiles = Array.from({ length: mapH }, () => Array(mapW).fill('empty'));
  coins = [];
  flagPos = null;

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = (y * mapW + x) * 4;
      const hex =
        (mapImg.pixels[idx] << 16) |
        (mapImg.pixels[idx + 1] << 8) |
        mapImg.pixels[idx + 2];

      if      (hex === 0x000000) tiles[y][x] = 'platform';
      else if (hex === 0xFF00FF) tiles[y][x] = 'lava';
      else if (hex === 0xFF0000) playerStart = createVector(x, y);
      else if (hex === 0x11FF00) coins.push({ x: x * tileSize, y: y * tileSize });
      else if (hex === 0xEAFF4D) flagPos = { x, y };
    }
  }
  totalCoins = coins.length;
}

function parseMapFrom(imgObj) {
  mapImg = imgObj;
  parseMap();
}

/* ══════════ Minimal touch overlay ══════════ */
function makeTouchUI(sm) {
  if (document.getElementById('touch-pad')) return;

  const pad = createDiv('')
    .id('touch-pad')
    .style(`
      position:fixed; left:0; right:0; bottom:0;
      display:flex; justify-content:space-between;
      padding:12px; gap:12px; pointer-events:none;
    `);

  const mkBtn = (label, keyObj, prop) => {
    const b = createButton(label)
      .parent(pad)
      .style(`
        font-size:28px; padding:12px 18px; border-radius:12px;
        background:rgba(255,255,255,.35); backdrop-filter:blur(4px);
        pointer-events:auto; border:none;`
      );
    b.touchStarted(() => { keyObj[prop] = true; });
    b.touchEnded(()   => { keyObj[prop] = false; });
    return b;
  };

  mkBtn('↻', {}, '').mousePressed(() => {
    sm.change('start');
  });
  mkBtn('⚽️', touchKeys, 'kick');
  mkBtn('⤒', touchKeys, 'jump');
  mkBtn('<',  touchKeys, 'left');
  mkBtn('>',  touchKeys, 'right');
}
