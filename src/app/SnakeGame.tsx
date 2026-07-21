import { useEffect, useRef, useState } from 'react';
import styles from './SnakeGame.module.css';

const GRID = 15;
const TICK_MS = 140;

const DIR = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
} as const;

type Dir = { x: number; y: number };

interface SnakeGameProps {
  paused?: boolean;
}

function opposite(a: Dir, b: Dir) {
  return a.x === -b.x && a.y === -b.y;
}

function randomGrid() {
  return { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
}

export function SnakeGame({ paused }: SnakeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snakeRef = useRef<{ x: number; y: number }[]>([]);
  const dirRef = useRef<Dir>({ x: 1, y: 0 });
  const nextRef = useRef<Dir>({ x: 1, y: 0 });
  const foodRef = useRef({ x: 0, y: 0 });
  const scoreRef = useRef(0);
  const stateRef = useRef<'idle' | 'playing' | 'gameOver'>('idle');
  const lastRef = useRef(0);
  const rafRef = useRef(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [score, setScore] = useState(0);
  const [state, setState] = useState<'idle' | 'playing' | 'gameOver'>('idle');

  function spawnFood(): { x: number; y: number } {
    const snake = snakeRef.current;
    for (let attempt = 0; attempt < 200; attempt++) {
      const p = randomGrid();
      if (!snake.some((s) => s.x === p.x && s.y === p.y)) return p;
    }
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (!snake.some((s) => s.x === x && s.y === y)) return { x, y };
      }
    }
    return { x: 0, y: 0 };
  }

  function setDir(d: Dir) {
    if (stateRef.current === 'idle') {
      stateRef.current = 'playing';
      setState('playing');
    }
    if (stateRef.current === 'playing' && !opposite(d, dirRef.current)) {
      nextRef.current = d;
    }
  }

  function reset() {
    const mid = Math.floor(GRID / 2);
    snakeRef.current = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dirRef.current = { x: 1, y: 0 };
    nextRef.current = { x: 1, y: 0 };
    scoreRef.current = 0;
    stateRef.current = 'idle';
    lastRef.current = 0;
    foodRef.current = spawnFood();
    setScore(0);
    setState('idle');
  }

  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const cell = rect.width / GRID;
    const snake = snakeRef.current;
    const food = foodRef.current;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, rect.width, rect.height);

    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#1e1e32' : '#1a1a2e';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
    ctx.fill();

    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#2ecc71' : '#27ae60';
      const pad = 1;
      ctx.fillRect(seg.x * cell + pad, seg.y * cell + pad, cell - pad * 2, cell - pad * 2);
      if (i === 0) {
        ctx.fillStyle = '#fff';
        const eyeSize = cell * 0.12;
        ctx.fillRect(seg.x * cell + cell * 0.28, seg.y * cell + cell * 0.28, eyeSize, eyeSize);
        ctx.fillRect(seg.x * cell + cell * 0.6, seg.y * cell + cell * 0.28, eyeSize, eyeSize);
      }
    });
  }

  function tick(
    snake: { x: number; y: number }[],
    dir: Dir,
    food: { x: number; y: number },
    s: number,
  ) {
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID)
      return { snake, food, score: s, dead: true };
    if (snake.some((seg) => seg.x === head.x && seg.y === head.y))
      return { snake, food, score: s, dead: true };

    const newSnake = [head, ...snake];
    let newFood = food;
    let newScore = s;
    if (head.x === food.x && head.y === food.y) {
      newScore = s + 1;
      newFood = spawnFood();
    } else {
      newSnake.pop();
    }
    return { snake: newSnake, food: newFood, score: newScore, dead: false };
  }

  function loop(now: number) {
    if (paused) {
      render();
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (!lastRef.current) lastRef.current = now;

    if (stateRef.current === 'playing' && now - lastRef.current >= TICK_MS) {
      dirRef.current = nextRef.current;
      const result = tick(snakeRef.current, dirRef.current, foodRef.current, scoreRef.current);
      snakeRef.current = result.snake;
      foodRef.current = result.food;
      scoreRef.current = result.score;
      lastRef.current = now;

      if (result.dead) {
        stateRef.current = 'gameOver';
        setState('gameOver');
        setScore(result.score);
      } else {
        setScore(result.score);
      }
    }

    render();
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => {
    reset();
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const keyMap: Record<string, Dir> = {
        ArrowUp: DIR.UP,
        ArrowDown: DIR.DOWN,
        ArrowLeft: DIR.LEFT,
        ArrowRight: DIR.RIGHT,
      };
      const d = keyMap[e.key];
      if (d) {
        e.preventDefault();
        setDir(d);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 30) return;
    if (absDx > absDy) {
      setDir(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    } else {
      setDir(dy > 0 ? DIR.DOWN : DIR.UP);
    }
  }

  return (
    <div className={styles.game}>
      <div className={styles.scoreBar}>
        <span>🐍 Snake</span>
        <span>Score: {score}</span>
      </div>
      <div className={styles.wrapper}>
        <canvas ref={canvasRef} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} />
        {state === 'idle' && <div className={styles.overlay}>Press any arrow to start</div>}
        {state === 'gameOver' && (
          <div className={styles.overlay} onClick={reset}>
            Game Over — tap to restart
          </div>
        )}
      </div>
      <div className={styles.dpad}>
        <button className={styles.dpadUp} onPointerDown={() => setDir(DIR.UP)}>
          ↑
        </button>
        <button className={styles.dpadLeft} onPointerDown={() => setDir(DIR.LEFT)}>
          ←
        </button>
        <button className={styles.dpadRight} onPointerDown={() => setDir(DIR.RIGHT)}>
          →
        </button>
        <button className={styles.dpadDown} onPointerDown={() => setDir(DIR.DOWN)}>
          ↓
        </button>
      </div>
    </div>
  );
}
