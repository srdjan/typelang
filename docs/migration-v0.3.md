# Migration Guide: v0.2.x → v0.3.0

## Overview

**typelang v0.3.0** introduces automatic cancellation and resource cleanup inspired by
[Effection](https://frontside.com/effection). This is a **breaking change** that requires updating
all custom handler implementations.

**Key Benefits:**
- ✅ Automatic cleanup on Ctrl-C (SIGINT/SIGTERM)
- ✅ Structured concurrency with parent→child cancellation propagation
- ✅ Resource leak prevention via LIFO cleanup callbacks
- ✅ Zero user-facing complexity (no manual `AbortSignal` passing)

---

## Breaking Changes

### 1. Handler Function Signature (REQUIRED)

**All handlers must add a third parameter `ctx: CancellationContext`.**

#### Before (v0.2.x):
```typescript
const myHandler: Handler = {
  name: "MyEffect",
  handles: {
    doSomething: (instr, next) => {
      const [arg] = instr.args;
      return processArg(arg);
    }
  }
};
```

#### After (v0.3.0):
```typescript
const myHandler: Handler = {
  name: "MyEffect",
  handles: {
    doSomething: (instr, next, ctx) => {  // ← Added ctx parameter
      const [arg] = instr.args;
      return processArg(arg);
    }
  }
};
```

**Why?** The `ctx` parameter provides access to the cancellation signal and cleanup registration:

```typescript
type CancellationContext = {
  readonly signal: AbortSignal;  // Check if cancelled
  readonly onCancel: (cleanup: () => void | Promise<void>) => void;  // Register cleanup
};
```

---

## Migration Checklist

### Step 1: Update Handler Signatures

Add `ctx` parameter to **all** handler functions in your codebase:

```bash
# Search for handlers that need updating
rg "handles:\s*\{" --type ts
```

**Affected handlers:**
- Custom effect handlers (your domain effects)
- Middleware handlers (if using custom middleware)
- Test fixtures (mock handlers)

**Example patterns:**

```typescript
// Pattern 1: Simple handler (no cancellation logic needed)
handles: {
  log: (instr, next, ctx) => {  // ← Add ctx even if unused
    console.log(...instr.args);
  }
}

// Pattern 2: Async handler with cancelable API
handles: {
  fetch: async (instr, next, ctx) => {
    const [url] = instr.args;
    // Pass signal to fetch for automatic cancellation
    return await fetch(url, { signal: ctx.signal });
  }
}

// Pattern 3: Handler with resource cleanup
handles: {
  openFile: async (instr, next, ctx) => {
    const [path] = instr.args;
    const file = await Deno.open(path, { read: true });

    // Register cleanup callback
    ctx.onCancel(async () => {
      await file.close();
      console.log(`Closed file: ${path}`);
    });

    return file;
  }
}
```

### Step 2: Add Cleanup for Resources

Review your handlers for resource acquisition and register cleanup callbacks:

**Resources requiring cleanup:**
- File handles (`Deno.open`, `file.close()`)
- Network connections (WebSocket, database connections)
- Timers (`setTimeout`, `setInterval`)
- Subprocesses (`Deno.Command`)
- Lock acquisitions (mutexes, semaphores)
- Temporary files/directories

**Cleanup pattern:**

```typescript
// 1. Acquire resource
const resource = await acquireResource();

// 2. Register cleanup IMMEDIATELY
ctx.onCancel(async () => {
  await resource.release();
});

// 3. Use resource (if cancelled, cleanup runs automatically)
return await resource.use();
```

### Step 3: Update Built-in Handler Usage

No changes required for built-in handlers (`Console`, `State`, `Exception`, `Async`, `Http`) -
they've been updated automatically. However, note new features:

- **`Async.sleep(ms)`**: Now cancelable via Ctrl-C or parent abort
- **`Http.op.get(url)` (NEW)**: Cancelable HTTP requests with automatic signal passing

### Step 4: Test Cancellation Behavior

1. **Test Ctrl-C handling:**
   ```typescript
   // Create a long-running program
   const program = seq()
     .let(() => Async.op.sleep(10000))  // 10 seconds
     .tap(() => Console.op.log("Completed"))
     .value();

   await stack(handlers.Async.default(), handlers.Console.live()).run(() => program);
   // Press Ctrl-C → Should print "Received interrupt signal" and exit gracefully
   ```

2. **Test resource cleanup:**
   ```typescript
   // Ensure cleanup callbacks fire
   const fileHandler: Handler = {
     name: "File",
     handles: {
       write: async (instr, next, ctx) => {
         const [path, data] = instr.args;
         const file = await Deno.open(path, { write: true, create: true });

         let cleaned = false;
         ctx.onCancel(async () => {
           cleaned = true;
           await file.close();
         });

         // Simulate error → cleanup should fire
         throw new Error("Test error");
       }
     }
   };

   try {
     await stack(fileHandler).run(() => File.op.write("/tmp/test", "data"));
   } catch (error) {
     // Verify: cleaned === true
   }
   ```

3. **Test parallel cancellation:**
   ```typescript
   // par.race should cancel losers
   const race = par.race([
     () => Async.op.sleep(100).then(() => "fast"),
     () => Async.op.sleep(1000).then(() => "slow"),
   ]);

   const winner = await stack(handlers.Async.default()).run(() => race);
   // winner === "fast", slow branch's sleep timer was cancelled
   ```

---

## Common Patterns

### Pattern 1: Cancelable Network Request

```typescript
const apiHandler: Handler = {
  name: "API",
  handles: {
    call: async (instr, next, ctx) => {
      const [endpoint, options] = instr.args;

      // Merge ctx.signal with user options
      const response = await fetch(endpoint, {
        ...options,
        signal: ctx.signal  // ← Automatic cancellation
      });

      return await response.json();
    }
  }
};
```

### Pattern 2: Timer with Cleanup

```typescript
const timerHandler: Handler = {
  name: "Timer",
  handles: {
    after: (instr, next, ctx) =>
      new Promise((resolve) => {
        const [ms, value] = instr.args;
        const timerId = setTimeout(() => resolve(value), ms);

        // Clean up timer on cancellation
        ctx.onCancel(() => clearTimeout(timerId));
      })
  }
};
```

### Pattern 3: Lock Acquisition

```typescript
const lockHandler: Handler = {
  name: "Lock",
  handles: {
    acquire: async (instr, next, ctx) => {
      const [lockName] = instr.args;
      await lockManager.acquire(lockName);

      // Ensure lock is released even on cancellation
      ctx.onCancel(async () => {
        await lockManager.release(lockName);
      });

      return lockName;
    }
  }
};
```

---

## Troubleshooting

### Issue: TypeScript errors about handler signature

**Error:**
```
Type '(instr: AnyInstr, next: Next) => ...' is not assignable to type 'HandlerFn'.
```

**Solution:** Add `ctx` parameter to the handler function:
```typescript
// Before
(instr, next) => ...

// After
(instr, next, ctx) => ...
```

### Issue: Cleanup not running

**Possible causes:**
1. Cleanup registered after operation completes
2. Controller never aborted (normal completion)
3. Exception in cleanup callback (logged but swallowed)

**Solution:**
```typescript
// ✅ Correct: Register cleanup immediately after acquisition
const resource = await acquire();
ctx.onCancel(() => resource.release());

// ❌ Wrong: Registering cleanup after use
const resource = await acquire();
await use(resource);
ctx.onCancel(() => resource.release());  // Too late if use() throws!
```

### Issue: Cleanup timeout warnings

**Warning:**
```
Cleanup timeout exceeded (5000ms) - forcing continuation
```

**Cause:** Cleanup callback taking longer than 5 seconds.

**Solution:**
- Reduce cleanup work (close connections faster)
- Increase timeout (future: configurable)
- Investigate hung operations

---

## Rollback Plan

If you encounter issues with v0.3.0, you can temporarily roll back to v0.2.x:

```bash
# In deno.json, change import map
"imports": {
  "typelang/": "https://deno.land/x/typelang@0.2.0/"
}
```

**Note:** v0.2.x does not support cancellation or cleanup - resource leaks may occur on Ctrl-C.

---

## Additional Resources

- [Design Document](./cancellation-design.md) - Full technical specification
- [CLAUDE.md](../CLAUDE.md#3-automatic-cancellation--cleanup) - Quick reference
- [GitHub Issues](https://github.com/yourusername/typelang/issues) - Report bugs or request features

---

## Version Compatibility

| Version | Handler Signature | Cancellation | Notes |
|---------|------------------|--------------|-------|
| v0.2.x  | `(instr, next)` | ❌ Not supported | Resource leaks on interrupt |
| v0.3.0  | `(instr, next, ctx)` | ✅ Automatic | BREAKING CHANGE |

---

## Questions?

If you have migration questions or encounter issues:

1. Check [Troubleshooting](#troubleshooting) section above
2. Review [Common Patterns](#common-patterns) for your use case
3. Open an issue with `[migration]` tag

**Happy migrating! 🚀**
