const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

// ─────────────────────────────────────────────────────────────────────────────
// Force a single copy of React across the monorepo.
//
// This workspace uses pnpm with `nodeLinker: hoisted` (a flat, npm-style
// node_modules), and admin/seller pin react ^19.2.5 while this app is pinned
// to the exact 19.1.0 Expo SDK 54 was built against. pnpm can only hoist one
// react to the workspace root, so any shared package whose peer resolution
// needs the other version (e.g. use-sync-external-store, pulled in by
// @react-navigation/elements) gets its own private nested copy of react.
//
// Metro's default resolver walks up through every parent node_modules from
// the *requiring* file, so a request for "react" made from inside that
// nested use-sync-external-store copy finds the private 19.2.7 there before
// it reaches the real one — a second, disconnected React instance, which
// shows up as hook calls crashing with "Cannot read properties of null".
//
// An earlier version of this file fixed that by setting
// disableHierarchicalLookup + a restricted nodeModulesPaths, but that
// disables hierarchical lookup for *everything*, not just the singleton
// packages — it broke resolution of other legitimately-nested packages
// (white screen / "reading 'default' of undefined", "Something went wrong"
// in Expo Go). This intercepts resolution only for the small set of packages
// that must be a true singleton, rewriting the requesting file's location to
// this app's own root before delegating back to Metro's normal algorithm —
// every other import is resolved exactly as before.
// ─────────────────────────────────────────────────────────────────────────────

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')
const anchorFile = path.join(projectRoot, 'package.json')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]

const SINGLETON_PACKAGES = ['react', 'react-dom', 'react-native', 'scheduler', 'use-sync-external-store']

function isSingletonRequest(moduleName) {
  return SINGLETON_PACKAGES.some(
    (name) => moduleName === name || moduleName.startsWith(`${name}/`),
  )
}

const { resolveRequest: defaultResolveRequest } = config.resolver

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (isSingletonRequest(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: anchorFile },
      moduleName,
      platform,
    )
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform)
}

module.exports = config
