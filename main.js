/*  Aidan & Dune’s Adventure  – side‑scroller build
    -------------------------------------------------
    Features
      • robust platform collision (no tunnelling, 1‑tile crawl)
      • 20 % stronger jump
      • walk animation plays even when pushing a wall
      • DVD logos spawn safely, bounce with sound
      • X‑key (or ⚽️ button) launches gravity‑bouncing balls (ball.png)
      • Touch overlay & tap‑to‑start for mobile
*/

/* ─── Global constants ─── */
const GAME_TIME_LIMIT = 60_000;
const GRAVITY         = 1.1;
const MOVE_SPEED      = 4;
const JUMP_STRENGTH   = 20;       // 20 % stronger
const TERMINAL_VEL    = 25;
const logoScale       = 0.25;
const SPRITE_SCALE    = 1.5;      // draw 150 % size

/* ─── Mobile helpers ─── */
const IS_TOUCH = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const touchKeys = { left:false, right:false, jump:false, kick:false };

/* ─── Assets & globals ─── */
let img  = {}, sfx = {}, music;
let mapImg, tileSize, mapW, mapH;
let tiles = [], coins = [], flagPos = null, playerStart;
let totalCoins = 0;
let sceneManager;

/* ══════════ preload ══════════ */
function preload() {
  [
    // UI & sprites
    'startupBackground', 'selectionBackground',
    'aidanLogo', 'duneLogo',
    'platform', 'lava', 'flag', 'coin', 'ball',
    // sprite sheets
    'dune_idle', 'dune_walk', 'dune_jump',
    'aidan_idle', 'aidan_walk', 'aidan_jump'
  ].forEach(name => img[name] = loadImage(`assets/${name}.png`));

  mapImg        = loadImage('assets/map1.png');

  // sounds (guarded)
  music         = loadSound('assets/audioLoop.wav');
  sfx.jump      = loadSound('assets/jump.wav');
  sfx.coin      = loadSound('assets/coin.wav');
  sfx.bonk      = loadSound('assets/collide.wav');
  sfx.kick      = loadSound('assets/kick.wav');
  sfx.bounce    = loadSound('assets/bounce.wav');
}

/* ══════════ setup ══════════ */
function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(window.devicePixelRatio || 1);  // crisp on Retina
  noSmooth();
  textAlign(CENTER, CENTER);

  parseMap();

  sceneManager = new SceneManager();
  sceneManager.change('start');

  if (music) {
    music.setLoop(true);
    music.setVolume(0.6);
  }
}
function draw()            { sceneManager.updateAndDraw(); }
function keyPressed()      { sceneManager.keyPressed?.(keyCode); }
function mousePressed()    { sceneManager.mousePressed?.(); }
function windowResized()   { resizeCanvas(windowWidth, windowHeight); parseMap(); sceneManager.onResize?.(); }

/* ══════════ Scene Manager ══════════ */
class SceneManager {
  constructor() {
    this.scenes = {
      start : new Start(this),
      select: new Select(this),
      play  : new Play(this),
      over  : new Over(this),
      win   : new Win(this)
    };
    this.current = null;
  }
  change(name, data) { this.current?.exit?.(); this.current = this.scenes[name]; this.current.enter?.(data); }
  updateAndDraw()    { this.current?.update?.(); this.current?.draw?.(); }
  keyPressed(k)      { this.current?.keyPressed?.(k); }
  mousePressed()     { this.current?.mousePressed?.(); }
  onResize()         { this.current?.onResize?.(); }
}

/* ══════════ Utility Classes ══════════ */
class Logo {
  constructor(img) {
    this.img = img;
    this.w   = img.width  * logoScale;
    this.h   = img.height * logoScale;

    // spawn away from borders
    const margin = 10;
    let ok = false;
    while (!ok) {
      this.pos = createVector(
        random(margin, width  - margin - this.w),
        random(margin, height - margin - this.h)
      );
      ok = (this.pos.x > margin &&
            this.pos.y > margin &&
            this.pos.x + this.w < width  - margin &&
            this.pos.y + this.h < height - margin);
    }
    this.vel = p5.Vector.random2D().setMag(3);
  }
  update() {
    this.pos.add(this.vel);
    let bounced = false;
    if (this.pos.x < 0 || this.pos.x + this.w > width)  { this.vel.x *= -1; bounced = true; }
    if (this.pos.y < 0 || this.pos.y + this.h > height) { this.vel.y *= -1; bounced = true; }
    if (bounced) sfx.bonk?.play();
  }
  draw()           { image(this.img, this.pos.x, this.pos.y, this.w, this.h); }
  collides(o)      { return !(o.pos.x >= this.pos.x + this.w || o.pos.x + o.w <= this.pos.x ||
                              o.pos.y >= this.pos.y + this.h || o.pos.y + o.h <= this.pos.y); }
  bounce(o)        { [this.vel, o.vel] = [o.vel.copy(), this.vel.copy()]; sfx.bonk?.play(); }
}

class Sprite {
  constructor(sheet, frames, scale) { this.sheet = sheet; this.frames = frames; this.scale = scale; this.f = 0; }
  draw(x, y, flip, speed) {
    if (!this.sheet) return;
    this.f = (this.f + speed) % this.frames;
    const sz = this.sheet.height;
    push();
    if (flip) { translate(x + sz * this.scale, y); scale(-1, 1); }
    else      { translate(x, y); }
    image(this.sheet, 0, 0, sz * this.scale, sz * this.scale, floor(this.f) * sz, 0, sz, sz);
    pop();
  }
}

/* ══════════ Ball ══════════ */
class Ball {
  constructor(x, y, dirRight) {
    this.pos  = createVector(x, y);
    const ang = dirRight ? -PI / 4 : -3 * PI / 4;  // 45°
    this.vel  = p5.Vector.fromAngle(ang).setMag(8);
    this.r    = tileSize * 0.4;
    this.spin = random(-0.2, 0.2);                 // rad / frame
    this.a    = 0;                                 // current angle
  }

  update() {
    /* gravity */
    this.vel.y += GRAVITY * 0.5;

    /* predict step */
    const next = p5.Vector.add(this.pos, this.vel);

    /* --- horizontal wall test -------------------- */
    if (next.x - this.r < 0 || next.x + this.r > mapW * tileSize) {
      this.vel.x *= -1;
      sfx.bounce?.play();
    }

    /* --- vertical / platform test ---------------- */
    const tx = floor(next.x / tileSize);
    const vy = this.vel.y > 0 ? next.y + this.r : next.y - this.r; // foot or head
    const ty = floor(vy / tileSize);

    if (tiles[ty]?.[tx] === 'platform') {
      this.vel.y *= -0.85;                         // elastic
      sfx.bounce?.play();
    }

    /* apply */
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
    this.w   = tileSize * 0.8;
    this.h   = tileSize * 0.9;
    this.g   = false;
    this.flip = false;
    this.walkIntent = false;

    this.idle = new Sprite(sheets.idle, 2, this.w / 64);
    this.walk = new Sprite(sheets.walk, 8, this.w / 64);
    this.jump = new Sprite(sheets.jump, 1, this.w / 64);
  }

  /* ── Patched update(): desktop + touch ── */
  update() {
    /* 1. Input: physical keys OR on‑screen --------------------------- */
    let dir = 0;
    if (keyIsDown(65) || keyIsDown(LEFT_ARROW) || touchKeys.left) {
      dir = -1;
    }
    if (keyIsDown(68) || keyIsDown(RIGHT_ARROW) || touchKeys.right) {
      dir = 1;
    }

    const wantJump = keyIsDown(32) ||
                     keyIsDown(UP_ARROW) ||
                     touchKeys.jump;

    const wantKick = keyIsDown(88) || touchKeys.kick;

    /* 2. Horizontal motion ------------------------------------------ */
    this.walkIntent = dir !== 0;
    this.vel.x = lerp(this.vel.x, dir * MOVE_SPEED, 0.2);
    if (dir !== 0) {
      this.flip = dir < 0;
    }

    /* 3. Jump -------------------------------------------------------- */
    if (wantJump && this.g) {
      this.vel.y = -JUMP_STRENGTH;
      this.g = false;
      if (sfx.jump) { sfx.jump.play(); }
    }

    /* 4. Kick / launch ball ----------------------------------------- */
    if (wantKick) {
      touchKeys.kick = false;                       // edge‑triggered
      const bx = this.pos.x + this.w / 2;
      const by = this.pos.y + this.h / 2;
      this.scene.balls.push(new Ball(bx, by, !this.flip));
      if (sfx.kick) { sfx.kick.play(); }
    }

    /* 5. Physics ----------------------------------------------------- */
    this.vel.y += GRAVITY;
    this.vel.y = constrain(this.vel.y, -TERMINAL_VEL, TERMINAL_VEL);

    this.pos.x += this.vel.x;
    this.resolveX();

    this.pos.y += this.vel.y;
    this.resolveY();
  }

  /* horizontal collide ignoring top/bottom 25 % so crawl‑gap works */
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
    if (this.vel.y > 0) {                      // falling
      const yTile = floor((this.pos.y + this.h) / tileSize);
      const left  = floor(this.pos.x / tileSize);
      const right = floor((this.pos.x + this.w - 1) / tileSize);

      for (let tx = left; tx <= right; tx++) {
        if (tiles[yTile]?.[tx] === 'platform') {
          this.pos.y = yTile * tileSize - this.h - 0.01;
          this.vel.y = 0;
          this.g     = true;
          break;
        }
      }
    } else if (this.vel.y < 0) {               // rising
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
    if (!this.g)                this.jump.draw(this.pos.x, this.pos.y, this.flip, 0);
    else if (this.walkIntent)   this.walk.draw(this.pos.x, this.pos.y, this.flip, 0.3);
    else                        this.idle.draw(this.pos.x, this.pos.y, this.flip, 0.1);
  }
}

/* ══════════ Scenes ══════════ */
class Start {
  constructor(sm) { this.sm = sm; }
  enter()  { this.logos = [new Logo(img.aidanLogo), new Logo(img.duneLogo)]; }
  update() { this.logos.forEach(l => l.update());
             if (this.logos[0].collides(this.logos[1])) this.logos[0].bounce(this.logos[1]); }
  draw() {
    background(0);
    image(img.startupBackground, 0, 0, width, height);
    stroke(0); strokeWeight(6); fill('#ff66cc');
    textSize(56); text("Aidan & Dune's Adventure", width / 2, height * 0.25);
    textSize(24); text("Press any key", width / 2, height * 0.32);
    noStroke();
    this.logos.forEach(l => l.draw());
  }
  keyPressed()  { getAudioContext().resume();
                  if (music && !music.isPlaying()) music.play();
                  this.sm.change('select'); }
  mousePressed() { this.keyPressed(); }          // tap = any key
}

class Select {
  constructor(sm) { this.sm = sm; }
  enter() {
    this.aBox = { x: width * 0.25 - img.aidanLogo.width  * logoScale / 2,
                  y: height * 0.45 - img.aidanLogo.height * logoScale / 2,
                  w: img.aidanLogo.width  * logoScale,
                  h: img.aidanLogo.height * logoScale };
    this.dBox = { x: width * 0.75 - img.duneLogo.width  * logoScale / 2,
                  y: this.aBox.y,
                  w: img.duneLogo.width  * logoScale,
                  h: img.duneLogo.height * logoScale };
    this.hover = null;
  }
  update() {
    const inBox = (b) => mouseX > b.x && mouseX < b.x + b.w && mouseY > b.y && mouseY < b.y + b.h;
    this.hover = inBox(this.aBox) ? 'aidan' : inBox(this.dBox) ? 'dune' : null;
    cursor(this.hover ? 'pointer' : 'default');
  }
  draw() {
    image(img.selectionBackground, 0, 0, width, height);
    fill(255); textSize(40); text("Choose your character", width / 2, height * 0.25);
    image(img.aidanLogo, this.aBox.x, this.aBox.y, this.aBox.w, this.aBox.h);
    image(img.duneLogo , this.dBox.x, this.dBox.y, this.dBox.w, this.dBox.h);
  }
  mousePressed() { if (this.hover) this.sm.change('play', { char: this.hover }); }
}

class Play {
  constructor(sm) { this.sm = sm; }
  enter(data) {
    this.char = data?.char || 'dune';
    const sheets = {
      idle: img[this.char + '_idle'],
      walk: img[this.char + '_walk'],
      jump: img[this.char + '_jump']
    };
    this.p = new Player(playerStart.x * tileSize, playerStart.y * tileSize, sheets);
    this.p.scene = this;                       // let player spawn balls

    if (IS_TOUCH) makeTouchUI(this.sm);        // one‑time overlay

    this.cam   = 0;
    this.t0    = millis();
    this.coins = coins.map(c => ({ ...c, col:false }));
    this.balls = [];
  }

  update() {
    const timeLeft = GAME_TIME_LIMIT - (millis() - this.t0);
    if (timeLeft <= 0) {
      this.sm.change('over', { c: this.collected() });
      return;
    }

    this.p.update();
    this.cam = constrain(this.p.pos.x + this.p.w / 2 - width / 2, 0, mapW * tileSize - width);

    /* coin collect */
    for (const c of this.coins) {
      if (!c.col && dist(this.p.pos.x, this.p.pos.y, c.x, c.y) < tileSize * 0.8) {
        c.col = true;
        sfx.coin?.play();
      }
    }

    /* balls */
    for (const b of this.balls) b.update();
    this.handleBallCollisions();

    /* lose / win */
    if (this.p.pos.y > mapH * tileSize || this.touchLava())
      this.sm.change('over', { c: this.collected() });

    if (dist(this.p.pos.x, this.p.pos.y,
             flagPos.x * tileSize, flagPos.y * tileSize) < tileSize)
      this.sm.change('win', { c: this.collected() });
  }

  /* --- helper collision checks --- */
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
          b.pos.add(p5.Vector.mult(n,  overlap / 2));
          const rel = p5.Vector.sub(a.vel, b.vel).dot(n);
          if (rel > 0) {
            const impulse = rel * 0.9;
            a.vel.sub(p5.Vector.mult(n, impulse));
            b.vel.add(p5.Vector.mult(n, impulse));
            sfx.bounce?.play();
          }
        }
      }
    }
  }

  /* --- rendering --- */
  draw() {
    image(img.startupBackground, -this.cam, 0, 20000, height);  // scrolling sky

    push(); translate(-this.cam, 0);

    /* tiles */
    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const t = tiles[y][x];
        if (t === 'platform')
          image(img.platform, x * tileSize, y * tileSize, tileSize, tileSize);
        else if (t === 'lava')
          image(img.lava, x * tileSize, y * tileSize, tileSize, tileSize);
      }
    }

    /* balls, coins, flag, player */
    this.balls.forEach(b => b.draw());
    this.coins.forEach(c => !c.col &&
      image(img.coin, c.x, c.y, tileSize, tileSize));
    image(img.flag, flagPos.x * tileSize, flagPos.y * tileSize - tileSize,
          tileSize, tileSize * 1.5);
    this.p.draw();

    pop();

    /* HUD */
    image(img[this.char + 'Logo'], 10, 10,
          img[this.char + 'Logo'].width * logoScale,
          img[this.char + 'Logo'].height * logoScale);
    fill(255); textSize(24);
    text(`Coins: ${this.collected()}/${totalCoins}`, width - 120, 30);
    text(ceil((GAME_TIME_LIMIT - (millis() - this.t0)) / 1000), width / 2, 30);
  }

  collected() { return this.coins.filter(c => c.col).length; }

  /* --- input --- */
  keyPressed(k) {
    if (k === 82) this.sm.change('start');              // R = restart
    if (k === 88) {                                     // X = kick
      const bx = this.p.pos.x + this.p.w / 2;
      const by = this.p.pos.y + this.p.h / 2;
      this.balls.push(new Ball(bx, by, !this.p.flip));
      sfx.kick?.play();
    }
  }
}

class Over {
  constructor(sm) { this.sm = sm; }
  enter(d) { this.c = d.c; music?.pause(); }
  draw() {
    background(0);
    fill(255, 0, 0); textSize(48);
    text("GAME OVER", width / 2, height * 0.4);
    fill(255); textSize(24);
    text(`Coins: ${this.c}/${totalCoins}`, width / 2, height * 0.5);
    text("Press R to retry", width / 2, height * 0.56);
  }
  keyPressed(k) { if (k === 82) this.sm.change('start'); }
}

class Win {
  constructor(sm) { this.sm = sm; }
  enter(d) { this.c = d.c; music?.pause(); }
  draw() {
    background(135, 206, 250);
    fill(0); textSize(48); text("YOU WIN!", width / 2, height * 0.4);
    textSize(24); text(`Coins: ${this.c}/${totalCoins}`, width / 2, height * 0.5);
    text("Press R to replay", width / 2, height * 0.56);
  }
  keyPressed(k) { if (k === 82) this.sm.change('start'); }
}

/* ══════════ Map Parse ══════════ */
function parseMap() {
  mapW = mapImg.width;
  mapH = mapImg.height;
  tileSize = height / mapH;

  mapImg.loadPixels();
  tiles = Array.from({ length: mapH }, () => Array(mapW).fill('empty'));
  coins = []; flagPos = null;

  for (let y = 0; y < mapH; y++) {
    for (let x = 0; x < mapW; x++) {
      const idx = (y * mapW + x) * 4;
      const hex = (mapImg.pixels[idx] << 16) |
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

/* ══════════ Minimal touch overlay ══════════ */
function makeTouchUI(sm) {
  // build once
  if (document.getElementById('touch‑pad')) return;

  const pad = createDiv('').id('touch‑pad').style(`
        position:fixed; left:0; right:0; bottom:0;
        display:flex; justify-content:space-between;
        padding:12px; gap:12px; pointer-events:none;`);

  const mkBtn = (label, keyObj, prop) => {
    const b = createButton(label).parent(pad).style(`
          font-size:28px; padding:12px 18px; border-radius:12px;
          background:rgba(255,255,255,.35); backdrop-filter:blur(4px);
          pointer-events:auto; border:none;`);
    b.touchStarted(() => { keyObj[prop] = true; });
    b.touchEnded  (() => { keyObj[prop] = false; });
    return b;
  };

  mkBtn('⬅︎', touchKeys, 'left');
  mkBtn('➡︎', touchKeys, 'right');
  mkBtn('⤒',  touchKeys, 'jump');      // jump
  mkBtn('⚽️', touchKeys, 'kick');      // kick / launch ball
  mkBtn('↻',  {}, '').mousePressed(() => { sm.change('start'); });
}
