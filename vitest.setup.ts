import { enableMapSet } from "immer";

// mirror the app init (src/index.tsx) so Map/Set atoms work under vitest
enableMapSet();
