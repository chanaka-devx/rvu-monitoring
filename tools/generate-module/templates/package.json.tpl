{
  "name": "@rvu/module-__NAME__",
  "version": "0.0.0",
  "private": true,
  "main": "./public-api.ts",
  "types": "./public-api.ts",
  "exports": {
    ".": {
      "types": "./public-api.ts",
      "default": "./public-api.ts"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit false --outDir dist",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
