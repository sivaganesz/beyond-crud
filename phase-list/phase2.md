# Phase 2 — Contract-first design

Phase 2 has three dimensions that need full treatment: the mental model behind contract-first, the complete file structure with every contract written out, and Zod's full validation power with real examples. Here's the architecture of how contracts sit in your system first:`packages/contracts` is the centre of gravity. Both `apps/api` and `apps/web` import from it — they never import from each other. The contract is the only agreement between them. Now let's go through every layer of this phase with complete depth.

---

## The core mental model: a contract is a promise, not code

Most engineers build like this: write the handler → figure out what it returns → tell the frontend team. This creates a permanent coupling between two moving targets. The frontend builds against what the backend says it returns today. The backend changes something. The frontend breaks. Nobody notices until runtime.

Contract-first inverts this completely. You write the promise first. The backend fulfills the promise. The frontend consumes the promise. The promise never changes without everyone knowing — because changing it breaks the TypeScript compilation of both sides simultaneously.

This is not an abstract principle. It is the literal mechanism: `packages/contracts` exports a type. `apps/api` implements a function that must return that type. `apps/web` calls a function that it knows returns that type. If the backend returns the wrong shape, TypeScript fails the build. The contract is enforced at compile time, automatically, on every save.

---

## The complete folder structure for Phase 2

This is exactly what `packages/contracts` should look like when the phase is complete:

```
packages/contracts/
  src/
    auth.contract.ts          ← login, register, refresh, logout
    chat.contract.ts          ← sendMessage, getMessages, getRooms, createRoom
    notification.contract.ts  ← getNotifications, markRead, markAllRead
    user.contract.ts          ← getProfile, updateProfile, getUsers (admin)
    shared.types.ts           ← reusable types used across contracts
    index.ts                  ← re-exports everything
  package.json
  tsconfig.json
```

One file per domain. Exactly the same domains that will exist in `apps/api/` later. The contract structure dictates the backend structure — which is the point.

---

## `shared.types.ts` — the types every contract uses

Before writing any contract, you need the reusable building blocks. These are the shapes that appear in multiple responses:

```typescript
// packages/contracts/src/shared.types.ts
import { z } from 'zod';

// Every paginated response has the same wrapper
export const PaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    total: z.number().int()
  });

// Every user object returned in any response looks like this
export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['user', 'admin']),
  avatarUrl: z.string().url().nullable(),
  createdAt: z.string().datetime()
});

// Every message object looks like this
export const MessageSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  senderId: z.string().uuid(),
  sender: UserSchema.pick({ id: true, name: true, avatarUrl: true }),
  roomId: z.string().uuid(),
  createdAt: z.string().datetime(),
  editedAt: z.string().datetime().nullable()
});

// Every error response looks like this
export const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.string()).optional()
});

// TypeScript types inferred from the schemas — no duplication
export type User = z.infer<typeof UserSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type Paginated<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};
```

The critical line is `export type User = z.infer<typeof UserSchema>`. You define the shape once with Zod. TypeScript infers the type from it automatically. You never write a TypeScript interface and a Zod schema separately — they would drift. One definition, two purposes: runtime validation and compile-time type.

---

## The complete `auth.contract.ts`

```typescript
// packages/contracts/src/auth.contract.ts
import { z } from 'zod';
import { oc } from '@orpc/contract';
import { UserSchema } from './shared.types';

const TokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int()   // seconds until access token expires
});

export const authContract = oc.router({

  register: oc
    .input(z.object({
      name: z.string()
        .min(2, 'Name must be at least 2 characters')
        .max(50, 'Name cannot exceed 50 characters')
        .trim(),
      email: z.string()
        .email('Must be a valid email address')
        .toLowerCase(),
      password: z.string()
        .min(8, 'Password must be at least 8 characters')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
    }))
    .output(z.object({
      user: UserSchema,
      tokens: TokenPairSchema
    })),

  login: oc
    .input(z.object({
      email: z.string().email().toLowerCase(),
      password: z.string().min(1)
    }))
    .output(z.object({
      user: UserSchema,
      tokens: TokenPairSchema
    })),

  refresh: oc
    .input(z.object({
      refreshToken: z.string().min(1)
    }))
    .output(z.object({
      tokens: TokenPairSchema
    })),

  logout: oc
    .input(z.object({
      refreshToken: z.string().min(1)
    }))
    .output(z.object({
      success: z.literal(true)
    })),

  getMe: oc
    .input(z.object({}))   // no input — uses JWT from header
    .output(z.object({
      user: UserSchema
    }))

});

export type AuthContract = typeof authContract;
```

Notice how Zod validation messages are written in plain English. `.min(8, 'Password must be at least 8 characters')`. When this schema rejects a request, the error message is what the frontend shows the user. The contract owns the validation — the frontend does not need to duplicate these rules.

---

## The complete `chat.contract.ts`

```typescript
// packages/contracts/src/chat.contract.ts
import { z } from 'zod';
import { oc } from '@orpc/contract';
import { MessageSchema, UserSchema, PaginatedSchema } from './shared.types';

const RoomSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: z.enum(['direct', 'group']),
  members: z.array(UserSchema.pick({ id: true, name: true, avatarUrl: true })),
  lastMessage: MessageSchema.nullable(),
  unreadCount: z.number().int().min(0),
  createdAt: z.string().datetime()
});

export const chatContract = oc.router({

  getRooms: oc
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(20)
    }))
    .output(PaginatedSchema(RoomSchema)),

  createRoom: oc
    .input(z.object({
      name: z.string().min(1).max(100).trim(),
      type: z.enum(['direct', 'group']),
      memberIds: z.array(z.string().uuid())
        .min(1, 'A room needs at least one other member')
        .max(49, 'Group rooms support up to 50 members')
    }))
    .output(z.object({
      room: RoomSchema
    })),

  getMessages: oc
    .input(z.object({
      roomId: z.string().uuid(),
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(50)
    }))
    .output(PaginatedSchema(MessageSchema)),

  sendMessage: oc
    .input(z.object({
      roomId: z.string().uuid(),
      content: z.string()
        .min(1, 'Message cannot be empty')
        .max(4000, 'Message cannot exceed 4000 characters')
        .trim()
    }))
    .output(z.object({
      message: MessageSchema
    })),

  editMessage: oc
    .input(z.object({
      messageId: z.string().uuid(),
      content: z.string().min(1).max(4000).trim()
    }))
    .output(z.object({
      message: MessageSchema
    })),

  deleteMessage: oc
    .input(z.object({
      messageId: z.string().uuid()
    }))
    .output(z.object({
      success: z.literal(true)
    }))

});

export type ChatContract = typeof chatContract;
```

Look at `PaginatedSchema(RoomSchema)` — the generic paginated wrapper from `shared.types.ts` wrapping the room shape. You define the pagination structure once and compose it with any item type. This is the same pattern your IDE uses when it infers `Array<User>` — composition of types.

---

## Zod's full validation power — what most tutorials skip

Zod is not just "make sure this is a string". It is a full validation language. Here is a reference of every pattern you need:

```typescript
// packages/contracts/src/zod-patterns-reference.ts
import { z } from 'zod';

// --- String transformations (run before validation) ---
z.string().trim()           // removes whitespace before validating length
z.string().toLowerCase()    // normalises email before storing
z.string().toUpperCase()

// --- String constraints with custom messages ---
z.string().min(8, 'Too short')
z.string().max(100, 'Too long')
z.string().email('Not a valid email')
z.string().url('Not a valid URL')
z.string().uuid('Must be a UUID')
z.string().regex(/^\+[0-9]{10,14}$/, 'Must be E.164 phone format')
z.string().startsWith('https://', 'Must use HTTPS')

// --- Number constraints ---
z.number().int()            // must be integer (no decimals)
z.number().positive()       // > 0
z.number().min(0).max(100)  // range
z.number().multipleOf(5)    // must be divisible by 5

// --- Enum: exactly one of these values ---
z.enum(['user', 'admin', 'moderator'])

// --- Optional vs nullable vs default ---
z.string().optional()       // value can be undefined (field can be absent)
z.string().nullable()       // value can be null (field must be present)
z.string().nullish()        // can be undefined OR null
z.string().default('hello') // if absent, use this value

// --- Object: pick and omit for derived types ---
const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  password: z.string(),       // exists on the full user
  role: z.enum(['user', 'admin'])
});

const PublicUser = UserSchema.omit({ password: true }); // never expose password
const LoginInput = UserSchema.pick({ email: true, password: true });

// --- Array with item-level validation ---
z.array(z.string().uuid())
  .min(1, 'Need at least one item')
  .max(50, 'Cannot exceed 50 items')
  .nonempty() // same as .min(1) but TypeScript infers [string, ...string[]]

// --- Union: one of several shapes ---
const EventSchema = z.union([
  z.object({ type: z.literal('message'), content: z.string() }),
  z.object({ type: z.literal('join'), roomId: z.string() }),
  z.object({ type: z.literal('leave'), roomId: z.string() })
]);

// --- Discriminated union: faster, better errors ---
const EventSchema2 = z.discriminatedUnion('type', [
  z.object({ type: z.literal('message'), content: z.string() }),
  z.object({ type: z.literal('join'), roomId: z.string() })
]);

// --- Refine: custom logic ---
const PasswordConfirmSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine(
  (data) => data.password === data.confirmPassword,
  {
    message: 'Passwords do not match',
    path: ['confirmPassword']   // error appears on this field
  }
);

// --- Transform: shape the output differently from the input ---
const DateStringSchema = z.string()
  .datetime()
  .transform(str => new Date(str)); // input: ISO string → output: Date object

// --- Infer types from schemas ---
type Event = z.infer<typeof EventSchema2>;
// TypeScript knows Event is:
// | { type: 'message'; content: string }
// | { type: 'join'; roomId: string }
```

---

## The `index.ts` — your single import point

```typescript
// packages/contracts/src/index.ts
export * from './shared.types';
export * from './auth.contract';
export * from './chat.contract';
export * from './notification.contract';
export * from './user.contract';

// Re-export the contract types for use in implementing servers
export type {
  AuthContract,
  ChatContract,
  NotificationContract,
  UserContract
} from './auth.contract';
// ... etc
```

The `package.json` for contracts points its `main` at the compiled output:

```json
{
  "name": "@beyond-crud/contracts",
  "version": "0.0.1",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  }
}
```

Now both apps import like this:

```typescript
// In apps/api — implementing the contract
import { authContract, UserSchema } from '@beyond-crud/contracts';

// In apps/web — consuming the contract
import type { User, Message, AuthContract } from '@beyond-crud/contracts';
```

One package name. Full type safety across the boundary. This is what Turborepo makes possible without publishing to npm.

---

## What the contract buys you in practice: three concrete scenarios

**Scenario 1 — The backend changes a field name.** The backend engineer renames `accessToken` to `token` in the login handler. Without contracts, this silently breaks the frontend at runtime — the app ships with a bug. With contracts, `apps/api` no longer satisfies the `AuthContract` type. TypeScript fails the build immediately. The engineer sees the error before the code even runs.

**Scenario 2 — The frontend reads a field that doesn't exist.** The frontend reads `user.username` but the contract defines `user.name`. TypeScript shows a red underline in the IDE the moment this is written. Zero runtime, zero deploy, zero user impact.

**Scenario 3 — A new endpoint is needed.** The frontend team needs a `searchMessages` endpoint. They add it to `chat.contract.ts` with the input and output they need. The backend team sees the contract, knows exactly what to implement, and fulfills it. The frontend calls it with full type safety before the backend is even deployed — because they wrote a mock that satisfies the same contract.

This is parallel development. This is how teams of 10 and teams of 100 both work. You are learning it at phase 2, before writing a single handler, because the rest of the system depends on getting this right.
