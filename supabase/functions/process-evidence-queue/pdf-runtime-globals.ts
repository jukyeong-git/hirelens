// pdfjs-dist's legacy build resolves browser canvas globals while the module is
// still initialising, so importing it inside the Supabase Edge Runtime fails
// with "DOMMatrix is not defined" before any PDF is opened.
//
// Evidence extraction only calls `getTextContent()`, so nothing here is ever
// used to rasterise a page. These stubs exist purely to let the module finish
// loading. They are deliberately minimal: anything that would actually draw
// should fail loudly rather than silently produce a blank page.

class DOMMatrixStub {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: number[] | string) {
    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    }
  }

  get isIdentity(): boolean {
    return (
      this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0
    );
  }

  multiply(other: DOMMatrixStub): DOMMatrixStub {
    return new DOMMatrixStub([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]);
  }

  translate(tx = 0, ty = 0): DOMMatrixStub {
    return this.multiply(new DOMMatrixStub([1, 0, 0, 1, tx, ty]));
  }

  scale(sx = 1, sy = sx): DOMMatrixStub {
    return this.multiply(new DOMMatrixStub([sx, 0, 0, sy, 0, 0]));
  }

  transformPoint(point?: { x?: number; y?: number }): { x: number; y: number } {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

class Path2DStub {
  addPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  bezierCurveTo(): void {}
  quadraticCurveTo(): void {}
  closePath(): void {}
  rect(): void {}
}

class ImageDataStub {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/**
 * Installs the canvas globals pdfjs-dist reads at module scope. Safe to call
 * more than once and never overwrites a global the runtime already provides.
 */
export function installPdfRuntimeGlobals(): void {
  const scope = globalThis as Record<string, unknown>;
  if (scope.DOMMatrix === undefined) scope.DOMMatrix = DOMMatrixStub;
  if (scope.DOMMatrixReadOnly === undefined) scope.DOMMatrixReadOnly = DOMMatrixStub;
  if (scope.Path2D === undefined) scope.Path2D = Path2DStub;
  if (scope.ImageData === undefined) scope.ImageData = ImageDataStub;
}

// Installed as an import side effect. `evidence-processor.ts` imports the PDF
// module statically, and ES imports are evaluated before any module-level
// statement, so a call from inside the request handler would run too late.
installPdfRuntimeGlobals();
