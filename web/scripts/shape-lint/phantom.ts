// The shapes `web/scripts/shape-lint.mjs` guards. Each interface below gains one required field
// the product does not have, by declaration merging and only under this folder's tsconfig, so
// the type checker rejects every object that spells the whole shape out. To guard another
// shape, give it a factory first, then add its interface here.

declare module "../../src/protocol/session" {
  interface Session {
    requiredByShapeLint: true;
  }
  interface SessionRepo {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/messages" {
  interface Snapshot {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/prefs" {
  interface Prefs {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/usage" {
  interface Usage {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/update" {
  interface UpdateInfo {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/hello" {
  interface ClaudeCodeInfo {
    requiredByShapeLint: true;
  }
  interface Hello {
    requiredByShapeLint: true;
  }
}

declare module "../../src/protocol/groups" {
  interface Group {
    requiredByShapeLint: true;
  }
  interface UngroupedLayout {
    requiredByShapeLint: true;
  }
}

declare module "../../src/api/reader" {
  interface ReaderListing {
    requiredByShapeLint: true;
  }
}

export {};
