# Cinematic homepage

The existing TanStack Start `/` route renders the garden. Other routes and backend code remain unchanged.

## Integration

- Uses the existing language provider, Supabase auth client, React Query client and UI buttons/inputs.
- `pieces`: reads the current user's 28 most recently updated pieces. Each maps to one hammer. The full library stays at `/archive`.
- `scores` bucket + `books`: uploads a PDF or an ordered image collection using the archive's existing storage paths and schema. Upload success opens `/books/$bookId` for the existing scan/organize flow. Partial upload files are removed on failure.
- `/practice/$pieceId`: starts the existing practice room after the hammer strike. No replacement player or alternate practice-session implementation.
- `practice_session_items`: reads today's recorded practice duration. Merely visiting the homepage does not create a practice record.
- Visitors can explore all three scenes; account-specific actions show the existing sign-in route. No demo pieces are represented as user data.

## Rendering

The current homepage uses three generated photographic plates: a closed grand piano in the approved courtyard, an open-lid closer view, and a strings/hammer detail. Crossfades, gentle parallax, dust and image-aligned interaction regions provide the transitions. This is a photographic interaction design, not a fully articulated 3D piano. Reduced-motion preferences disable motion. Resize observers, listeners and audio are disposed on navigation. The earlier procedural model remains in scene.ts as an unused prototype; the homepage no longer imports or renders it.

Asset attribution and image brief: `public/garden/ATTRIBUTION.md`.

## Local verification

Run `bun install`, then `bun run dev -- --host 127.0.0.1 --port 4174`.

- Production build passed (`bun run build`).
- TypeScript reports an existing error in the unchanged `src/lib/use-abc-player.ts:220`: event callback returns void but abcjs expects EventCallbackReturn. No errors reported in the new homepage files.
- Browser verification: scene transitions, visitor upload/library states, language switching, existing sign-in link.
- Authenticated database writes and uploads need testing with a signed-in test account; no production records were created during verification.

Development branch: `codex/cinematic-home`. No schema migration or backend configuration change is required. The existing Lovable-connected main branch is not modified by publishing this development branch.
