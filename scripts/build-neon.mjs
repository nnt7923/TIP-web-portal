import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(root, '.neon-build');
if (path.dirname(target) !== root || path.basename(target) !== '.neon-build')
  throw new Error('Invalid build directory');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0)
    throw new Error(`Build command failed: ${command}`);
}

run('npm', ['run', 'db:generate']);
run('npm', ['run', 'build']);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
// Bundle compiled JavaScript, preserving Nest's emitted decorator metadata.
// Keep packages that load native binaries or static assets on disk.
const runtimePackages = [
  '@prisma/client',
  'bcrypt',
  'node-gyp-build',
  'swagger-ui-dist',
];
await build({
  absWorkingDir: root,
  entryPoints: ['dist/bootstrap.js'],
  outfile: path.join(target, 'dist/bootstrap.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  keepNames: true,
  external: [
    ...runtimePackages,
    '@nestjs/microservices',
    '@nestjs/websockets',
    'class-transformer/storage',
  ],
});
for (const name of runtimePackages)
  await cp(
    path.join(root, 'node_modules', name),
    path.join(target, 'node_modules', name),
    {
      recursive: true,
      filter: (source) => {
        const filename = path.basename(source);
        if (
          name === 'swagger-ui-dist' &&
          (filename.startsWith('swagger-ui-es-') ||
            filename === 'swagger-ui.js')
        )
          return false;
        if (
          source.endsWith('.map') ||
          source.endsWith('.d.ts') ||
          source.endsWith('.wasm')
        )
          return false;
        // The generated client uses the native library engine, not WASM or edge runtimes.
        if (
          name === '@prisma/client' &&
          path.dirname(source) ===
            path.join(root, 'node_modules', name, 'runtime')
        )
          return path.basename(source) === 'library.js';
        return true;
      },
    },
  );
await cp(
  path.join(root, 'node_modules/.prisma/client'),
  path.join(target, 'node_modules/.prisma/client'),
  {
    recursive: true,
    filter: (source) =>
      !path.basename(source).startsWith('query_engine-windows') &&
      !source.endsWith('.wasm'),
  },
);
await cp(
  path.join(root, 'functions/neon-entry.mjs'),
  path.join(target, 'index.mjs'),
);
await writeFile(
  path.join(target, 'package.json'),
  JSON.stringify({ private: true, type: 'commonjs' }),
);
console.log(
  'Neon artifact ready in .neon-build (no environment files included).',
);
