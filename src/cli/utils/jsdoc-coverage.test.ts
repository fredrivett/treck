import * as p from '@clack/prompts';
import { describe, expect, it, vi } from 'vitest';
import { isTrivialBody } from '../../extractors/trivial.js';
import type { ProjectScan } from './jsdoc-coverage.js';
import { renderMissingJsDocList } from './jsdoc-coverage.js';

vi.mock('@clack/prompts', () => ({
  log: {
    warn: vi.fn(),
    message: vi.fn(),
  },
}));

function makeScan(overrides: Partial<ProjectScan> = {}): ProjectScan {
  return {
    sourceFiles: [],
    allSymbols: [],
    totalSymbols: 0,
    exportedSymbols: 0,
    withJsDoc: 0,
    ...overrides,
  };
}

describe('renderMissingJsDocList', () => {
  it('does nothing when all exported symbols have JSDoc', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({ totalSymbols: 5, exportedSymbols: 5, withJsDoc: 5 });
    renderMissingJsDocList(scan, false);

    expect(p.log.warn).not.toHaveBeenCalled();
    expect(p.log.message).not.toHaveBeenCalled();
  });

  it('renders list when missing count is 20 or fewer', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 3,
      exportedSymbols: 3,
      withJsDoc: 1,
      allSymbols: [
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'bar', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'baz', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'qux', hasJsDoc: true, isExported: true, isTrivial: false },
        },
      ],
    });

    renderMissingJsDocList(scan, false);

    expect(p.log.warn).toHaveBeenCalledWith('Symbols missing JSDoc:');
    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    expect(message).toContain('bar');
    expect(message).toContain('baz');
    expect(message).not.toContain('qux');
  });

  it('shows verbose hint when missing count exceeds 20 and verbose is false', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 25,
      exportedSymbols: 25,
      withJsDoc: 0,
      allSymbols: Array.from({ length: 25 }, (_, i) => ({
        file: `/project/src/file${i}.ts`,
        symbol: { name: `sym${i}`, hasJsDoc: false, isExported: true, isTrivial: false },
      })),
    });

    renderMissingJsDocList(scan, false);

    expect(p.log.warn).not.toHaveBeenCalled();
    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    expect(message).toContain('--verbose');
    expect(message).toContain('25');
  });

  it('renders all symbols when verbose is true, even with more than 20', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 25,
      exportedSymbols: 25,
      withJsDoc: 0,
      allSymbols: Array.from({ length: 25 }, (_, i) => ({
        file: `/project/src/file${i}.ts`,
        symbol: { name: `sym${i}`, hasJsDoc: false, isExported: true, isTrivial: false },
      })),
    });

    renderMissingJsDocList(scan, true);

    expect(p.log.warn).toHaveBeenCalledWith('Symbols missing JSDoc:');
    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    expect(message).toContain('sym0');
    expect(message).toContain('sym24');
  });

  it('groups symbols by file', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 3,
      exportedSymbols: 3,
      withJsDoc: 0,
      allSymbols: [
        {
          file: '/project/src/a.ts',
          symbol: { name: 'alpha', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/b.ts',
          symbol: { name: 'beta', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/a.ts',
          symbol: { name: 'gamma', hasJsDoc: false, isExported: true, isTrivial: false },
        },
      ],
    });

    renderMissingJsDocList(scan, false);

    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    // Both alpha and gamma should appear under the same file grouping
    const lines = message.split('\n');
    const aFileLines = lines.filter(
      (l) => l.includes('a.ts') || l.includes('alpha') || l.includes('gamma'),
    );
    expect(aFileLines.length).toBeGreaterThanOrEqual(3);
  });

  it('excludes non-exported symbols from missing JSDoc list', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 3,
      exportedSymbols: 1,
      withJsDoc: 0,
      allSymbols: [
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'exported', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'internal', hasJsDoc: false, isExported: false, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'log', hasJsDoc: false, isExported: false, isTrivial: false },
        },
      ],
    });

    renderMissingJsDocList(scan, false);

    expect(p.log.warn).toHaveBeenCalledWith('Symbols missing JSDoc:');
    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    expect(message).toContain('exported');
    expect(message).not.toContain('internal');
    expect(message).not.toContain('log');
  });

  it('reports full coverage when only non-exported symbols lack JSDoc', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 3,
      exportedSymbols: 1,
      withJsDoc: 1,
      allSymbols: [
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'exported', hasJsDoc: true, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'internal', hasJsDoc: false, isExported: false, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'log', hasJsDoc: false, isExported: false, isTrivial: false },
        },
      ],
    });

    renderMissingJsDocList(scan, false);

    // Should not render anything since all exported symbols have JSDoc
    expect(p.log.warn).not.toHaveBeenCalled();
    expect(p.log.message).not.toHaveBeenCalled();
  });

  it('excludes trivial symbols from missing JSDoc list', () => {
    vi.mocked(p.log.warn).mockClear();
    vi.mocked(p.log.message).mockClear();

    const scan = makeScan({
      totalSymbols: 2,
      exportedSymbols: 1,
      withJsDoc: 0,
      allSymbols: [
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'ComplexComponent', hasJsDoc: false, isExported: true, isTrivial: false },
        },
        {
          file: '/project/src/foo.ts',
          symbol: { name: 'SimpleIcon', hasJsDoc: false, isExported: true, isTrivial: true },
        },
      ],
    });

    renderMissingJsDocList(scan, false);

    expect(p.log.warn).toHaveBeenCalledWith('Symbols missing JSDoc:');
    const message = vi.mocked(p.log.message).mock.calls[0][0] as string;
    expect(message).toContain('ComplexComponent');
    expect(message).not.toContain('SimpleIcon');
  });
});

describe('isTrivialBody', () => {
  describe('trivial bodies (returns true)', () => {
    it('implicit arrow return of JSX (wrapped by extractor)', () => {
      expect(isTrivialBody('{ return <svg><path d="M0 0" /></svg> }')).toBe(true);
    });

    it('explicit block with single return', () => {
      expect(isTrivialBody('{ return (<Button>Click me</Button>) }')).toBe(true);
    });

    it('multiline JSX return', () => {
      const body = `{
  return (
    <Button asChild variant="ghost-subtle" size="icon" className={className}>
      <a href="https://example.com" target="_blank" rel="noreferrer">
        <Icon className="size-4" />
      </a>
    </Button>
  )
}`;
      expect(isTrivialBody(body)).toBe(true);
    });

    it('props pass-through component', () => {
      expect(isTrivialBody('{ return <Button className={className}>{children}</Button> }')).toBe(
        true,
      );
    });

    it('simple value return', () => {
      expect(isTrivialBody('{ return 42 }')).toBe(true);
    });

    it('return with function call', () => {
      expect(isTrivialBody('{ return someFunc(a, b) }')).toBe(true);
    });

    it('return with template literal', () => {
      // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional test input containing template syntax
      expect(isTrivialBody('{ return `Hello ${name}` }')).toBe(true);
    });

    it('return with object literal', () => {
      expect(isTrivialBody('{ return { foo: 1, bar: 2 } }')).toBe(true);
    });

    it('return with array literal', () => {
      expect(isTrivialBody('{ return [1, 2, 3] }')).toBe(true);
    });
  });

  describe('non-trivial bodies (returns false)', () => {
    it('variable declaration before return', () => {
      expect(isTrivialBody('{ const x = 1; return x }')).toBe(false);
    });

    it('hook call before return', () => {
      const body = `{
  const [state, setState] = useState(0);
  return <div>{state}</div>
}`;
      expect(isTrivialBody(body)).toBe(false);
    });

    it('multiple hooks before return', () => {
      const body = `{
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus() }, []);
  return <input ref={ref} />
}`;
      expect(isTrivialBody(body)).toBe(false);
    });

    it('conditional before return', () => {
      expect(isTrivialBody('{ if (x) { return a } return b }')).toBe(false);
    });

    it('multiple statements', () => {
      expect(isTrivialBody('{ doSomething(); return result }')).toBe(false);
    });

    it('try/catch block', () => {
      expect(isTrivialBody('{ try { return x } catch { return y } }')).toBe(false);
    });

    it('loop before return', () => {
      expect(isTrivialBody('{ for (const x of items) { sum += x } return sum }')).toBe(false);
    });

    it('empty body', () => {
      expect(isTrivialBody('{}')).toBe(false);
    });

    it('empty string', () => {
      expect(isTrivialBody('')).toBe(false);
    });

    it('let declaration before return', () => {
      expect(isTrivialBody('{ let result = compute(); return result }')).toBe(false);
    });

    it('assignment before return', () => {
      expect(isTrivialBody('{ data.count++; return data }')).toBe(false);
    });

    it('destructuring before return', () => {
      expect(isTrivialBody('{ const { foo, bar } = props; return <div>{foo}{bar}</div> }')).toBe(
        false,
      );
    });

    it('await before return', () => {
      expect(isTrivialBody('{ const data = await fetch(url); return data.json() }')).toBe(false);
    });

    it('class body with methods', () => {
      const body = `{
  constructor() { this.x = 0 }
  getX() { return this.x }
}`;
      expect(isTrivialBody(body)).toBe(false);
    });
  });
});
