import type { Rng } from "../core/rng";

/**
 * Tiny integer expression evaluator for rule parameters, e.g. "=tier*80+rand(0,40)".
 * Supports + - * / (floor division), parentheses, unary minus, variables and the functions rand(a,b), min(a,b), max(a,b).
 * No eval, no floats: results are deterministic.
 */
export type ExprVars = Record<string, number>;

interface Parser {
  src: string;
  pos: number;
  vars: ExprVars;
  rng: Rng;
}

function skip(p: Parser): void {
  while (p.pos < p.src.length && p.src[p.pos] === " ") p.pos++;
}

function number(p: Parser): number {
  skip(p);
  const start = p.pos;
  while (p.pos < p.src.length && /[0-9]/.test(p.src[p.pos]!)) p.pos++;
  if (start === p.pos) throw new Error(`expr: number expected at ${p.pos} in "${p.src}"`);
  return Number(p.src.slice(start, p.pos));
}

function factor(p: Parser): number {
  skip(p);
  const c = p.src[p.pos];
  if (c === "-") {
    p.pos++;
    return -factor(p);
  }
  if (c === "(") {
    p.pos++;
    const v = expression(p);
    skip(p);
    if (p.src[p.pos] !== ")") throw new Error(`expr: ")" expected in "${p.src}"`);
    p.pos++;
    return v;
  }
  if (c !== undefined && /[a-zA-Z_]/.test(c)) {
    const start = p.pos;
    while (p.pos < p.src.length && /[a-zA-Z0-9_]/.test(p.src[p.pos]!)) p.pos++;
    const name = p.src.slice(start, p.pos);
    skip(p);
    if (p.src[p.pos] === "(") {
      p.pos++;
      const args: number[] = [];
      skip(p);
      if (p.src[p.pos] !== ")") {
        args.push(expression(p));
        skip(p);
        while (p.src[p.pos] === ",") {
          p.pos++;
          args.push(expression(p));
          skip(p);
        }
      }
      if (p.src[p.pos] !== ")") throw new Error(`expr: ")" expected after arguments in "${p.src}"`);
      p.pos++;
      return call(name, args, p);
    }
    const value = p.vars[name];
    if (value === undefined) throw new Error(`expr: unknown variable "${name}" in "${p.src}"`);
    return value;
  }
  return number(p);
}

function call(name: string, args: number[], p: Parser): number {
  switch (name) {
    case "rand":
      if (args.length !== 2) throw new Error("expr: rand(a,b) needs two arguments");
      return p.rng.range(args[0]!, Math.max(args[0]!, args[1]!));
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    default:
      throw new Error(`expr: unknown function "${name}"`);
  }
}

function term(p: Parser): number {
  let v = factor(p);
  for (;;) {
    skip(p);
    const op = p.src[p.pos];
    if (op === "*") {
      p.pos++;
      v *= factor(p);
    } else if (op === "/") {
      p.pos++;
      const d = factor(p);
      if (d === 0) throw new Error(`expr: division by zero in "${p.src}"`);
      v = Math.floor(v / d);
    } else return v;
  }
}

function expression(p: Parser): number {
  let v = term(p);
  for (;;) {
    skip(p);
    const op = p.src[p.pos];
    if (op === "+") {
      p.pos++;
      v += term(p);
    } else if (op === "-") {
      p.pos++;
      v -= term(p);
    } else return v;
  }
}

export function evalExpr(src: string, vars: ExprVars, rng: Rng): number {
  const p: Parser = { src, pos: 0, vars, rng };
  const v = expression(p);
  skip(p);
  if (p.pos !== src.length) throw new Error(`expr: unexpected "${src.slice(p.pos)}" in "${src}"`);
  return v;
}

/** Resolves a parameter: strings starting with `=` are evaluated, everything else is returned unchanged. */
export function resolveParam(value: number | string | boolean, vars: ExprVars, rng: Rng): number | string | boolean {
  if (typeof value === "string" && value.startsWith("=")) return evalExpr(value.slice(1), vars, rng);
  return value;
}
