# typelang v0.1.0 Language Guide

**A functional TypeScript subset with algebraic effects**

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Type System](#type-system)
4. [Algebraic Data Types](#algebraic-data-types)
5. [Effect System](#effect-system)
6. [Pattern Matching](#pattern-matching)
7. [Syntactic Sugar](#syntactic-sugar)
8. [Standard Library Reference](#standard-library-reference)
9. [Effect Handlers](#effect-handlers)
10. [Best Practices](#best-practices)
11. [Transpilation](#transpilation)

---

## Introduction

### What is typelang?

typelang is a minimal, functional programming language that is a strict subset of TypeScript syntax, with one semantic addition: algebraic effects via the `interface` keyword. It compiles to JavaScript and provides:

- **Algebraic Data Types** - Sum and product types with exhaustive pattern matching
- **Algebraic Effects** - Composable, trackable side effects via interfaces
- **Immutability** - All values are immutable by default
- **Type Safety** - Full TypeScript type inference and checking
- **Zero Runtime Overhead** - Effects are tracked at type level, erased at runtime

### Philosophy

typelang embraces:
- **Simplicity** - Minimal syntax, maximum expressiveness
- **Purity** - Effects are explicit and composable
- **Safety** - Compile-time guarantees prevent runtime errors
- **Compatibility** - Valid typelang is valid TypeScript
- **Familiarity** - TypeScript developers feel at home

### What's Excluded

typelang removes all object-oriented and imperative features:
- ❌ Classes, `this`, prototypes, `new`
- ❌ `var`, `let` (only `const`)
- ❌ `enum`, `namespace`, decorators
- ❌ `for`, `while`, `do-while` loops
- ❌ Mutable operations (`++`, `--`, `+=`, etc.)
- ❌ Statements (everything is an expression)

---

## Getting Started

### Hello World

```typescript
import { Console } from 'typelang/effects'
import { effect } from 'typelang/runtime'

const main = (): void & Console => {
  effect(Console.log('Hello, typelang!'))
}
```

### Basic Function

```typescript
// Pure function - no effects
const add = (a: number, b: number): number => 
  a + b

// Function with effects
const greet = (name: string): void & Console => {
  effect(Console.log(`Hello, ${name}!`))
}
```

### Immutability

```typescript
// All bindings are immutable
const x = 42
// x = 43  // ❌ Error: cannot reassign

// Records are readonly
type Point = {
  readonly x: number
  readonly y: number
}

// Create new values instead of mutating
const movePoint = (p: Point, dx: number, dy: number): Point => ({
  x: p.x + dx,
  y: p.y + dy
})
```

---

## Type System

### Primitive Types

```typescript
const num: number = 42
const str: string = "hello"
const bool: boolean = true
const nothing: null = null
const undef: undefined = undefined
```

### Type Aliases

```typescript
type UserId = string
type Timestamp = number
type Age = number

const userId: UserId = "user-123"
```

### Product Types (Records)

```typescript
type Person = {
  readonly name: string
  readonly age: number
  readonly email: string
}

const alice: Person = {
  name: "Alice",
  age: 30,
  email: "alice@example.com"
}
```

### Sum Types (Discriminated Unions)

```typescript
type Shape = 
  | { tag: 'Circle', radius: number }
  | { tag: 'Rectangle', width: number, height: number }
  | { tag: 'Triangle', base: number, height: number }

const circle: Shape = { tag: 'Circle', radius: 5 }
```

### Generics

```typescript
type Box<T> = {
  readonly value: T
}

const numberBox: Box<number> = { value: 42 }
const stringBox: Box<string> = { value: "hello" }

// Generic functions
const map = <T, U>(
  box: Box<T>, 
  f: (x: T) => U
): Box<U> => ({
  value: f(box.value)
})
```

### Union Types

```typescript
type StringOrNumber = string | number

const value1: StringOrNumber = "hello"
const value2: StringOrNumber = 42
```

### Intersection Types

```typescript
type Named = { readonly name: string }
type Aged = { readonly age: number }
type Person = Named & Aged

const person: Person = { name: "Bob", age: 25 }
```

### Type Inference

```typescript
// Type is inferred as number
const x = 42

// Type is inferred as (a: number, b: number) => number
const add = (a: number, b: number) => a + b

// Type is inferred from usage
const double = (x: number) => x * 2
const result = double(21)  // result: number
```

---

## Algebraic Data Types

### Option Type

```typescript
type Option<T> = 
  | { tag: 'Some', value: T }
  | { tag: 'None' }

// Constructors
const some = <T>(value: T): Option<T> => 
  ({ tag: 'Some', value })

const none = <T>(): Option<T> => 
  ({ tag: 'None' })

// Usage
const findUser = (id: string): Option<User> => {
  const user = database.get(id)
  return user !== undefined ? some(user) : none()
}
```

### Result Type

```typescript
type Result<T, E> = 
  | { tag: 'Ok', value: T }
  | { tag: 'Err', error: E }

// Constructors
const ok = <T, E>(value: T): Result<T, E> => 
  ({ tag: 'Ok', value })

const err = <T, E>(error: E): Result<T, E> => 
  ({ tag: 'Err', error })

// Usage
const divide = (a: number, b: number): Result<number, string> => {
  return b === 0 
    ? err("Division by zero")
    : ok(a / b)
}
```

### List Type

```typescript
type List<T> = 
  | { tag: 'Nil' }
  | { tag: 'Cons', head: T, tail: List<T> }

// Constructors
const nil = <T>(): List<T> => 
  ({ tag: 'Nil' })

const cons = <T>(head: T, tail: List<T>): List<T> => 
  ({ tag: 'Cons', head, tail })

// Usage
const list = cons(1, cons(2, cons(3, nil())))
```

### Custom ADTs

```typescript
// Binary tree
type Tree<T> = 
  | { tag: 'Leaf', value: T }
  | { tag: 'Node', left: Tree<T>, right: Tree<T> }

// JSON value
type Json = 
  | { tag: 'Null' }
  | { tag: 'Bool', value: boolean }
  | { tag: 'Num', value: number }
  | { tag: 'Str', value: string }
  | { tag: 'Arr', items: readonly Json[] }
  | { tag: 'Obj', fields: { readonly [key: string]: Json } }

// HTTP method
type HttpMethod = 
  | { tag: 'GET' }
  | { tag: 'POST', body: string }
  | { tag: 'PUT', body: string }
  | { tag: 'DELETE' }
```

---

## Effect System

### What are Effects?

Effects represent side effects as first-class values. Instead of hiding side effects, typelang makes them explicit in function signatures.

```typescript
// Pure function - no side effects
const add = (a: number, b: number): number => a + b

// Impure function - has Console effect
const printSum = (a: number, b: number): void & Console => {
  const sum = add(a, b)
  effect(Console.log(`Sum: ${sum}`))
}
```

### Defining Effects

Effects are defined using `interface`:

```typescript
interface Console {
  log(msg: string): void
  error(msg: string): void
  warn(msg: string): void
}

interface State<S> {
  get(): S
  put(s: S): void
  modify(f: (s: S) => S): void
}

interface FileSystem {
  readFile(path: string): string
  writeFile(path: string, content: string): void
}
```

### Performing Effects

Use `effect()` with effect constructors that mirror the interface:

```typescript
effect(EffectConstructor.operation(...args))
```

The effect constructors are objects that match the effect interface:

```typescript
// Console effect constructors
const Console = {
  log: (msg: string) => /* effect descriptor */,
  error: (msg: string) => /* effect descriptor */,
  warn: (msg: string) => /* effect descriptor */,
}

// State effect constructors
const State = {
  get: <S>() => /* effect descriptor */,
  put: <S>(s: S) => /* effect descriptor */,
  modify: <S>(f: (s: S) => S) => /* effect descriptor */,
}
```

### Examples

```typescript
// Console effect
const greeting = (): void & Console => {
  effect(Console.log('Hello!'))
  effect(Console.warn('This is a warning'))
  effect(Console.error('This is an error'))
}

// State effect
const increment = (): void & State<number> => {
  const current = effect(State.get<number>())
  effect(State.put(current + 1))
}

// Multiple effects
const app = (): void & Console & State<number> => {
  const count = effect(State.get<number>())
  effect(Console.log(`Count: ${count}`))
  effect(State.put(count + 1))
}
```

### Effect Composition

Effects compose via intersection types:

```typescript
type Effects = Console & State<number> & Exception

const complexComputation = (): number & Effects => {
  const state = effect(State.get<number>())
  
  if (state < 0) {
    effect(Exception.throw('Negative state!'))
  }
  
  effect(Console.log(`State: ${state}`))
  effect(State.put(state + 1))
  
  return state * 2
}
```

### Effect Polymorphism

Functions can be polymorphic over effects:

```typescript
const mapWithEffect = <T, U, E>(
  f: (x: T) => U & E,
  list: List<T>
): List<U> & E => {
  return match(list, {
    Nil: () => nil(),
    Cons: ({ head, tail }) => 
      cons(f(head), mapWithEffect(f, tail))
  })
}

// Usage with different effects
const numbers = cons(1, cons(2, cons(3, nil())))

// With Console effect
const withLogging = mapWithEffect(
  (x: number) => {
    effect(Console.log(`Processing ${x}`))
    return x * 2
  },
  numbers
)

// Pure (no effects)
const pure = mapWithEffect(
  (x: number) => x * 2,
  numbers
)
```

### Built-in Effects

#### Async

```typescript
interface Async {
  await<T>(promise: Promise<T>): T
}

const Async = {
  await: <T>(promise: Promise<T>) => /* effect descriptor */
}

const fetchData = (url: string): string & Async => {
  const promise = fetch(url).then(r => r.text())
  return effect(Async.await(promise))
}
```

#### State<S>

```typescript
interface State<S> {
  get(): S
  put(s: S): void
  modify(f: (s: S) => S): void
}

const State = {
  get: <S>() => /* effect descriptor */,
  put: <S>(s: S) => /* effect descriptor */,
  modify: <S>(f: (s: S) => S) => /* effect descriptor */
}

const counter = (): number & State<number> => {
  effect(State.modify<number>((n) => n + 1))
  return effect(State.get<number>())
}
```

#### Exception

```typescript
interface Exception {
  throw<E>(error: E): never
  catch<T>(computation: () => T): Result<T, unknown>
}

const Exception = {
  throw: <E>(error: E) => /* effect descriptor */,
  catch: <T>(computation: () => T) => /* effect descriptor */
}

const safeDiv = (a: number, b: number): number & Exception => {
  if (b === 0) {
    effect(Exception.throw('Division by zero'))
  }
  return a / b
}
```

#### Console

```typescript
interface Console {
  log(msg: string): void
  error(msg: string): void
  warn(msg: string): void
}

const Console = {
  log: (msg: string) => /* effect descriptor */,
  error: (msg: string) => /* effect descriptor */,
  warn: (msg: string) => /* effect descriptor */
}

const debug = <T>(label: string, value: T): T & Console => {
  effect(Console.log(`${label}: ${JSON.stringify(value)}`))
  return value
}
```

#### Random

```typescript
interface Random {
  next(): number
  nextInt(max: number): number
  nextRange(min: number, max: number): number
}

const Random = {
  next: () => /* effect descriptor */,
  nextInt: (max: number) => /* effect descriptor */,
  nextRange: (min: number, max: number) => /* effect descriptor */
}

const rollDice = (): number & Random => 
  effect(Random.nextInt(6)) + 1

const randomColor = (): string & Random => {
  const r = effect(Random.nextInt(256))
  const g = effect(Random.nextInt(256))
  const b = effect(Random.nextInt(256))
  return `rgb(${r}, ${g}, ${b})`
}
```

#### FileSystem

```typescript
interface FileSystem {
  readFile(path: string): string
  writeFile(path: string, content: string): void
  exists(path: string): boolean
  listDir(path: string): readonly string[]
}

const FileSystem = {
  readFile: (path: string) => /* effect descriptor */,
  writeFile: (path: string, content: string) => /* effect descriptor */,
  exists: (path: string) => /* effect descriptor */,
  listDir: (path: string) => /* effect descriptor */
}

const loadConfig = (path: string): Config & FileSystem & Exception => {
  const exists = effect(FileSystem.exists(path))
  if (!exists) {
    effect(Exception.throw(`Config not found: ${path}`))
  }
  const content = effect(FileSystem.readFile(path))
  return JSON.parse(content)
}
```

#### Http

```typescript
interface Http {
  get(url: string): string
  post(url: string, body: string): string
  request(config: HttpConfig): HttpResponse
}

const Http = {
  get: (url: string) => /* effect descriptor */,
  post: (url: string, body: string) => /* effect descriptor */,
  request: (config: HttpConfig) => /* effect descriptor */
}

const fetchUser = (id: string): User & Http & Exception => {
  const response = effect(Http.get(`/api/users/${id}`))
  return JSON.parse(response)
}
```

#### Environment

```typescript
interface Environment {
  getEnv(key: string): Option<string>
  currentTime(): number
  exit(code: number): never
}

const Environment = {
  getEnv: (key: string) => /* effect descriptor */,
  currentTime: () => /* effect descriptor */,
  exit: (code: number) => /* effect descriptor */
}

const getApiKey = (): string & Environment & Exception => {
  const maybeKey = effect(Environment.getEnv('API_KEY'))
  return maybeKey match {
    Some({ value }) => value,
    None() => effect(Exception.throw('API_KEY not set'))
  }
}
```

---

## Pattern Matching

### Basic Match

```typescript
const describe = <T>(opt: Option<T>): string =>
  match(opt, {
    Some: ({ value }) => `Value: ${value}`,
    None: () => 'No value'
  })
```

### Exhaustiveness Checking

```typescript
type Status = 
  | { tag: 'Pending' }
  | { tag: 'Running' }
  | { tag: 'Complete' }
  | { tag: 'Failed', error: string }

const statusMessage = (status: Status): string =>
  match(status, {
    Pending: () => 'Waiting to start',
    Running: () => 'In progress',
    Complete: () => 'Done!',
    // Failed: ({ error }) => `Error: ${error}`
    // ❌ Error: missing case 'Failed'
  })
```

### Nested Matching

```typescript
type Either<L, R> = 
  | { tag: 'Left', value: L }
  | { tag: 'Right', value: R }

const nested = (x: Either<Option<number>, string>): string =>
  match(x, {
    Left: ({ value }) => match(value, {
      Some: ({ value: n }) => `Number: ${n}`,
      None: () => 'No number'
    }),
    Right: ({ value }) => `String: ${value}`
  })
```

### Inline Pattern Matching (Sugar)

```typescript
const length = <T>(list: List<T>): number =>
  list match {
    Nil() => 0,
    Cons({ tail }) => 1 + length(tail)
  }

const getOrElse = <T>(opt: Option<T>, defaultVal: T): T =>
  opt match {
    Some({ value }) => value,
    None() => defaultVal
  }
```

### Guard Clauses

```typescript
const classify = (n: number): string =>
  n match {
    _ when n < 0 => 'negative',
    _ when n === 0 => 'zero',
    _ when n < 10 => 'small positive',
    _ when n < 100 => 'medium positive',
    _ => 'large positive'
  }

const describe = (age: number): string =>
  age match {
    _ when age < 13 => 'child',
    _ when age < 20 => 'teenager',
    _ when age < 65 => 'adult',
    _ => 'senior'
  }
```

---

## Syntactic Sugar

### Pipeline Operator (|>)

Transform data left-to-right:

```typescript
const result = 
  [1, 2, 3, 4, 5]
  |> (xs => xs.map(x => x * 2))
  |> (xs => xs.filter(x => x > 5))
  |> (xs => xs.reduce((a, b) => a + b, 0))
// result: 18

// With effects
const processUser = (id: string): User & Async & Http =>
  id
  |> (id => `/api/users/${id}`)
  |> (url => effect(Http.get(url)))
  |> (json => JSON.parse(json))
  |> (data => validateUser(data))
```

### Do-Notation

Sequential effect composition:

```typescript
const fetchAndProcess = (url: string): Data & Async & Http & Exception =>
  do {
    const response = yield* effect(Http.get(url))
    const parsed = yield* parseJSON(response)
    const validated = yield* validate(parsed)
    return validated
  }

// State example
const statefulComputation = (): number & State<number> =>
  do {
    const x = yield* effect(State.get<number>())
    yield* effect(State.put(x + 1))
    const y = yield* effect(State.get<number>())
    yield* effect(State.modify<number>((n) => n * 2))
    const z = yield* effect(State.get<number>())
    return z
  }
```

### Destructuring

```typescript
// Record destructuring
const { name, age } = person

// Array destructuring
const [first, second, ...rest] = array

// Function parameters
const greet = ({ name, age }: Person): string =>
  `Hello ${name}, age ${age}`

// Pattern matching with destructuring
const getHead = <T>(list: List<T>): Option<T> =>
  list match {
    Nil() => Opt.None(),
    Cons({ head }) => Opt.Some(head)
  }
```

---

## Standard Library Reference

### Opt Module (Option utilities)

```typescript
import { Opt } from 'typelang/std'

// Constructors
Opt.Some<T>(value: T): Option<T>
Opt.None<T>(): Option<T>

// Operations
Opt.map<T, U>(opt: Option<T>, f: (x: T) => U): Option<U>
Opt.flatMap<T, U>(opt: Option<T>, f: (x: T) => Option<U>): Option<U>
Opt.filter<T>(opt: Option<T>, pred: (x: T) => boolean): Option<T>
Opt.getOrElse<T>(opt: Option<T>, defaultVal: T): T
Opt.isSome<T>(opt: Option<T>): boolean
Opt.isNone<T>(opt: Option<T>): boolean

// Examples
const x = Opt.Some(42)
const doubled = Opt.map(x, (n) => n * 2)  // Some(84)
const y = Opt.None<number>()
const value = Opt.getOrElse(y, 0)  // 0
```

### Res Module (Result utilities)

```typescript
import { Res } from 'typelang/std'

// Constructors
Res.Ok<T, E>(value: T): Result<T, E>
Res.Err<T, E>(error: E): Result<T, E>

// Operations
Res.map<T, U, E>(result: Result<T, E>, f: (x: T) => U): Result<U, E>
Res.mapErr<T, E, F>(result: Result<T, E>, f: (e: E) => F): Result<T, F>
Res.flatMap<T, U, E>(result: Result<T, E>, f: (x: T) => Result<U, E>): Result<U, E>
Res.isOk<T, E>(result: Result<T, E>): boolean
Res.isErr<T, E>(result: Result<T, E>): boolean

// Examples
const divide = (a: number, b: number): Result<number, string> =>
  b === 0 ? Res.Err('Division by zero') : Res.Ok(a / b)

const result = divide(10, 2)  // Ok(5)
const doubled = Res.map(result, (n) => n * 2)  // Ok(10)
```

### Lst Module (List utilities)

```typescript
import { Lst } from 'typelang/std'

// Constructors
Lst.Nil<T>(): List<T>
Lst.Cons<T>(head: T, tail: List<T>): List<T>
Lst.fromArray<T>(arr: readonly T[]): List<T>
Lst.toArray<T>(list: List<T>): readonly T[]

// Operations
Lst.map<T, U>(list: List<T>, f: (x: T) => U): List<U>
Lst.filter<T>(list: List<T>, pred: (x: T) => boolean): List<T>
Lst.reduce<T, U>(list: List<T>, f: (acc: U, x: T) => U, initial: U): U
Lst.length<T>(list: List<T>): number
Lst.append<T>(list1: List<T>, list2: List<T>): List<T>

// Examples
const list = Lst.fromArray([1, 2, 3, 4, 5])
const doubled = Lst.map(list, (x) => x * 2)
const evens = Lst.filter(list, (x) => x % 2 === 0)
const sum = Lst.reduce(list, (acc, x) => acc + x, 0)
```

### Arr Module (Array utilities)

```typescript
import { Arr } from 'typelang/std'

// Operations (all return readonly arrays)
Arr.map<T, U>(arr: readonly T[], f: (x: T) => U): readonly U[]
Arr.filter<T>(arr: readonly T[], pred: (x: T) => boolean): readonly T[]
Arr.reduce<T, U>(arr: readonly T[], f: (acc: U, x: T) => U, initial: U): U
Arr.flatMap<T, U>(arr: readonly T[], f: (x: T) => readonly U[]): readonly U[]
Arr.find<T>(arr: readonly T[], pred: (x: T) => boolean): Option<T>
Arr.head<T>(arr: readonly T[]): Option<T>
Arr.tail<T>(arr: readonly T[]): Option<readonly T[]>

// Examples
const numbers = [1, 2, 3, 4, 5]
const doubled = Arr.map(numbers, (x) => x * 2)
const first = Arr.head(numbers)  // Some(1)
const found = Arr.find(numbers, (x) => x > 3)  // Some(4)
```

### Fn Module (Function utilities)

```typescript
import { Fn } from 'typelang/std'

// Composition
Fn.compose<A, B, C>(f: (b: B) => C, g: (a: A) => B): (a: A) => C
Fn.pipe<A, B, C>(f: (a: A) => B, g: (b: B) => C): (a: A) => C

// Currying
Fn.curry<A, B, C>(f: (a: A, b: B) => C): (a: A) => (b: B) => C
Fn.flip<A, B, C>(f: (a: A, b: B) => C): (b: B, a: A) => C

// Utilities
Fn.identity<T>(x: T): T
Fn.constant<T>(x: T): () => T
Fn.memoize<A, R>(f: (...args: A) => R): (...args: A) => R

// Examples
const add1 = (x: number) => x + 1
const mult2 = (x: number) => x * 2
const add1ThenMult2 = Fn.pipe(add1, mult2)
add1ThenMult2(5)  // 12

const curriedAdd = Fn.curry((a: number, b: number) => a + b)
const add5 = curriedAdd(5)
add5(3)  // 8
```

---

## Effect Handlers

### What are Handlers?

Handlers interpret effects, giving them concrete implementations. They use continuation-passing style to allow resumption.

### Handler Type

```typescript
type Handler<Eff, R, Result> = {
  [K in keyof Eff]: (
    ...args: Parameters<Eff[K]>
  ) => (resume: (result: ReturnType<Eff[K]>) => R) => R
} & {
  return: (value: Result) => R
}
```

### State Handler

```typescript
import { Eff } from 'typelang/std'

Eff.runState<S, R>(
  initial: S,
  computation: () => R & State<S>
): { result: R, state: S }

// Example
const program = (): number & State<number> =>
  do {
    const x = yield* effect(State.get<number>())
    yield* effect(State.put(x + 10))
    const y = yield* effect(State.get<number>())
    return y * 2
  }

const { result, state } = Eff.runState(5, program)
// result: 30, state: 15
```

### Exception Handler

```typescript
Eff.tryCatch<R>(
  computation: () => R & Exception
): Result<R, unknown>

// Example
const riskyOperation = (): number & Exception => {
  const x = getSomeValue()
  if (x < 0) {
    effect(Exception.throw('Negative value!'))
  }
  return x * 2
}

const result = Eff.tryCatch(riskyOperation)
// Result<number, unknown>
```

### Console Handler (for testing)

```typescript
Eff.captureConsole<R>(
  computation: () => R & Console
): { result: R, logs: readonly string[] }

// Example
const program = (): number & Console => {
  effect(Console.log('Starting'))
  const x = 42
  effect(Console.log(`Value: ${x}`))
  return x * 2
}

const { result, logs } = Eff.captureConsole(program)
// result: 84
// logs: ['Starting', 'Value: 42']
```

### Random Handler

```typescript
Eff.runRandom<R>(
  seed: number,
  computation: () => R & Random
): R

// Example
const program = (): number & Random => {
  const x = effect(Random.nextInt(10))
  const y = effect(Random.nextInt(10))
  return x + y
}

const result1 = Eff.runRandom(12345, program)
const result2 = Eff.runRandom(12345, program)
// result1 === result2 (deterministic)
```

### Custom Handlers

```typescript
// Define custom effect
interface Logger {
  debug(msg: string): void
  info(msg: string): void
}

const Logger = {
  debug: (msg: string) => /* effect descriptor */,
  info: (msg: string) => /* effect descriptor */
}

// Implement handler
const runLogger = <R>(
  computation: () => R & Logger
): { result: R, logs: readonly string[] } => {
  const logs: string[] = []
  
  const result = handle<Logger, R, R>({
    debug: (msg) => (resume) => {
      logs.push(`[DEBUG] ${msg}`)
      return resume(undefined)
    },
    info: (msg) => (resume) => {
      logs.push(`[INFO] ${msg}`)
      return resume(undefined)
    },
    return: (value) => value
  }, computation)
  
  return { result, logs }
}
```

### Handler Composition

```typescript
// Compose multiple handlers
const runApp = <S>(
  initialState: S,
  computation: () => void & State<S> & Console & Exception
) => {
  const withException = () => 
    Eff.tryCatch(() => computation())
  
  const withConsole = () =>
    Eff.captureConsole(withException)
  
  const withState = () =>
    Eff.runState(initialState, withConsole)
  
  return withState()
}
```

---

## Best Practices

### Effect Organization

```typescript
// Group related effects
type DatabaseEffects = Database & Exception
type ApiEffects = Http & Async & Exception
type AppEffects = DatabaseEffects & ApiEffects & Console

// Use type aliases for clarity
type UserService = (id: string) => User & ApiEffects
```

### Error Handling

```typescript
// Use Result for expected errors
const parseNumber = (str: string): Result<number, string> => {
  const num = Number(str)
  return isNaN(num) 
    ? Res.Err('Invalid number')
    : Res.Ok(num)
}

// Use Exception for unexpected errors
const divide = (a: number, b: number): number & Exception => {
  if (b === 0) {
    effect(Exception.throw('Division by zero'))
  }
  return a / b
}
```

### Composition Patterns

```typescript
// Pipeline for transformations
const process = (data: RawData): Result<ProcessedData, Error> =>
  data
  |> validate
  |> (result => Res.map(result, normalize))
  |> (result => Res.flatMap(result, enrich))
  |> (result => Res.map(result, format))

// Do-notation for effects
const workflow = (): void & AppEffects =>
  do {
    const user = yield* fetchUser()
    yield* validateUser(user)
    const data = yield* processUserData(user)
    yield* saveResults(data)
  }
```

### Immutability Patterns

```typescript
// Record updates
const updatePerson = (p: Person, age: number): Person => ({
  ...p,
  age
})

// Nested updates
const updateAddress = (
  p: Person,
  street: string
): Person => ({
  ...p,
  address: {
    ...p.address,
    street
  }
})

// Array operations (always return new arrays)
const addItem = <T>(arr: readonly T[], item: T): readonly T[] =>
  [...arr, item]

const removeAt = <T>(arr: readonly T[], index: number): readonly T[] =>
  [...arr.slice(0, index), ...arr.slice(index + 1)]
```

### Type-Driven Development

```typescript
// Define types first
type User = { readonly id: string, readonly name: string }
type UserError = 'NotFound' | 'Unauthorized' | 'ServerError'

// Then implement functions
const getUser = (id: string): Result<User, UserError> & Http & Async => {
  // Implementation follows from types
  // ...
}

// Compiler ensures all cases handled
const handleUser = (result: Result<User, UserError>): string =>
  result match {
    Ok({ value }) => `Found: ${value.name}`,
    Err({ error }) => error match {
      NotFound() => 'User not found',
      Unauthorized() => 'Access denied',
      ServerError() => 'Server error'
    }
  }
```

---

## Transpilation

### Effect Compilation

Effects are compiled to continuation-passing style (CPS):

```typescript
// Source
const program = (): number & State<number> => {
  const x = effect(State.get<number>())
  effect(State.put(x + 1))
  return x * 2
}

// Transpiled (simplified)
const program = (handlers) => (k) => {
  handlers.get()(x =>
    handlers.put(x + 1)(() =>
      k(x * 2)
    )
  )
}
```

### Pattern Matching Compilation

```typescript
// Source
const describe = (opt: Option<number>): string =>
  opt match {
    Some({ value }) => `Value: ${value}`,
    None() => 'No value'
  }

// Transpiled
const describe = (opt) => {
  switch (opt.tag) {
    case 'Some': return `Value: ${opt.value}`
    case 'None': return 'No value'
  }
}
```

### Pipeline Compilation

```typescript
// Source
const result = x |> f |> g |> h

// Transpiled
const result = h(g(f(x)))
```

### Do-Notation Compilation

```typescript
// Source
const program = do {
  const x = yield* getX()
  const y = yield* getY()
  return x + y
}

// Transpiled (generators or CPS)
const program = () =>
  getX().then(x =>
    getY().then(y =>
      x + y
    )
  )
```

---

## Appendix

### Complete Example: Todo App

```typescript
import { Opt, Res, Arr, Eff } from 'typelang/std'
import { effect } from 'typelang/runtime'
import { State, Exception } from 'typelang/effects'

type TodoId = string

type Todo = {
  readonly id: TodoId
  readonly text: string
  readonly completed: boolean
}

type AppState = {
  readonly todos: readonly Todo[]
  readonly nextId: number
}

type TodoError = 
  | { tag: 'NotFound', id: TodoId }
  | { tag: 'InvalidInput', message: string }

const initialState: AppState = {
  todos: [],
  nextId: 1
}

const addTodo = (text: string): TodoId & State<AppState> & Exception =>
  do {
    if (text.trim() === '') {
      effect(Exception.throw({ 
        tag: 'InvalidInput', 
        message: 'Todo text cannot be empty' 
      }))
    }
    
    const state = yield* effect(State.get<AppState>())
    const id = `todo-${state.nextId}`
    const todo: Todo = { id, text, completed: false }
    
    yield* effect(State.put<AppState>({
      todos: [...state.todos, todo],
      nextId: state.nextId + 1
    }))
    
    return id
  }

const toggleTodo = (id: TodoId): void & State<AppState> & Exception =>
  do {
    const state = yield* effect(State.get<AppState>())
    const todo = Arr.find(state.todos, (t) => t.id === id)
    
    const updatedTodo = todo match {
      Some({ value }) => { ...value, completed: !value.completed },
      None() => effect(Exception.throw({ tag: 'NotFound', id }))
    }
    
    const updatedTodos = state.todos.map(t =>
      t.id === id ? updatedTodo : t
    )
    
    yield* effect(State.put<AppState>({
      ...state,
      todos: updatedTodos
    }))
  }

const listTodos = (): readonly Todo[] & State<AppState> =>
  effect(State.get<AppState>()).todos

const runApp = () => {
  const program = () =>
    do {
      const id1 = yield* addTodo('Learn typelang')
      const id2 = yield* addTodo('Build an app')
      
      yield* toggleTodo(id1)
      
      return listTodos()
    }
  
  const result = Eff.runState(initialState, () =>
    Eff.tryCatch(program)
  )
  
  return result
}
```

---

## Resources

- **GitHub**: [typelang repository](#)
- **Documentation**: [docs.typelang.dev](#)
- **Playground**: [play.typelang.dev](#)
- **Examples**: [github.com/typelang/examples](#)

---

**typelang v0.1.0** - Functional TypeScript with Algebraic Effects  
© 2025 typelang contributors